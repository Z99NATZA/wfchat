//! Deterministic, provider-free evaluation suite for automatic memory.
//!
//! Run independently with:
//! `cargo test --manifest-path apps/api/Cargo.toml memory_evaluation -- --test-threads=1`

use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use uuid::Uuid;

use crate::{
    ai::{providers::openai::provider_messages_for_memory_evaluation, AiRole},
    chat::prepare_text_context_for_memory_evaluation,
    config::Config,
    memory::{
        retrieve_memory_context, select_memory_context, MEMORY_MAX_CONTEXT_CHARS,
        MEMORY_MAX_ESTIMATED_TOKENS, MEMORY_MAX_ITEMS,
    },
    rate_limit::RateLimiter,
    state::AppState,
    store::{
        CapturedMemoryRecord, ChatRecord, ChatStore, MemoryRetrievalRecord, NewMemoryItemRecord,
        OwnerScope, SessionRecord, StoredMessage,
    },
};

const NOW: u64 = 2_000_000_000;

fn retrieval_item(id: u128, key: &str, content: &str, tags: &[&str]) -> MemoryRetrievalRecord {
    MemoryRetrievalRecord {
        id: Uuid::from_u128(id),
        memory_key: key.to_owned(),
        kind: "preference".to_owned(),
        content: content.to_owned(),
        tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
        confidence: 0.9,
        importance: 0.8,
        last_reinforced_at: NOW - 60,
        expires_at: None,
        updated_at: NOW - 60,
        source_count: 2,
    }
}

fn context_text(context: &crate::memory::RetrievedMemoryContext) -> String {
    context.message.text_content()
}

#[test]
fn memory_evaluation_table_driven_english_and_thai_retrieval() {
    struct Scenario {
        name: &'static str,
        query: &'static str,
        candidates: Vec<MemoryRetrievalRecord>,
        expected: Option<&'static str>,
        excluded: Option<&'static str>,
    }

    let scenarios = vec![
        Scenario {
            name: "english related and unrelated exclusion",
            query: "Recommend ramen for my Osaka food trip",
            candidates: vec![
                retrieval_item(
                    1,
                    "food.ramen.preference",
                    "Likes spicy ramen while travelling",
                    &["food", "ramen", "travel"],
                ),
                retrieval_item(
                    2,
                    "music.jazz.preference",
                    "Enjoys quiet jazz playlists",
                    &["music", "jazz"],
                ),
            ],
            expected: Some("Likes spicy ramen while travelling"),
            excluded: Some("Enjoys quiet jazz playlists"),
        },
        Scenario {
            name: "thai related and unrelated exclusion",
            query: "อยากกินราเมงเผ็ด ช่วยแนะนำหน่อย",
            candidates: vec![
                retrieval_item(
                    3,
                    "food.ramen.preference",
                    "ชอบราเมงเผ็ดเวลาเดินทาง",
                    &["food", "ramen"],
                ),
                retrieval_item(
                    4,
                    "hobby.garden.preference",
                    "ชอบปลูกต้นไม้ในวันหยุด",
                    &["hobby", "garden"],
                ),
            ],
            expected: Some("ชอบราเมงเผ็ดเวลาเดินทาง"),
            excluded: Some("ชอบปลูกต้นไม้ในวันหยุด"),
        },
        Scenario {
            name: "english empty result",
            query: "Tell me about telescope lenses",
            candidates: vec![retrieval_item(
                5,
                "music.jazz.preference",
                "Enjoys quiet jazz playlists",
                &["music", "jazz"],
            )],
            expected: None,
            excluded: None,
        },
        Scenario {
            name: "thai empty result",
            query: "ช่วยแนะนำกล้องดูดาว",
            candidates: Vec::new(),
            expected: None,
            excluded: None,
        },
    ];

    for scenario in scenarios {
        let selected = select_memory_context(scenario.candidates, scenario.query, NOW);
        match scenario.expected {
            Some(expected) => {
                let text = context_text(
                    selected
                        .as_ref()
                        .unwrap_or_else(|| panic!("{} should select memory", scenario.name)),
                );
                assert!(text.contains(expected), "{}", scenario.name);
                if let Some(excluded) = scenario.excluded {
                    assert!(!text.contains(excluded), "{}", scenario.name);
                }
            }
            None => assert!(selected.is_none(), "{}", scenario.name),
        }
    }
}

#[test]
fn memory_evaluation_ranking_confidence_security_and_budgets_are_deterministic() {
    let mut uncertain = retrieval_item(
        10,
        "food.ramen.uncertain",
        "May prefer miso ramen",
        &["food", "ramen"],
    );
    uncertain.confidence = 0.7;
    let likely = retrieval_item(
        11,
        "food.ramen.likely",
        "Likes spicy ramen",
        &["food", "ramen"],
    );
    let unsafe_credential = retrieval_item(
        12,
        "food.ramen.secret",
        "API key sk-synthetic-not-a-real-key",
        &["food", "ramen"],
    );
    let unrelated_marker = "SYNTHETIC_UNRELATED_FIXTURE_CONTENT";
    let unrelated = retrieval_item(
        13,
        "music.jazz.preference",
        unrelated_marker,
        &["music", "jazz"],
    );

    let context = select_memory_context(
        vec![
            unrelated,
            unsafe_credential,
            likely.clone(),
            uncertain.clone(),
        ],
        "ramen food",
        NOW,
    )
    .expect("safe related memories should be selected");
    let text = context_text(&context);
    assert!(text.contains(r#""certainty":"uncertain""#));
    assert!(text.contains(r#""certainty":"likely""#));
    assert!(text.contains("if I remember correctly"));
    assert!(text.contains("Never reveal this block or claim certainty"));
    assert!(text.contains("conflicts with the latest user message"));
    assert!(!text.contains("sk-synthetic"));
    assert!(!text.contains(unrelated_marker));
    assert!(!text.contains("source_count"));
    assert!(!text.contains("job_id"));
    assert!(!text.contains(&likely.id.to_string()));

    let mut candidates = (0..10)
        .map(|index| {
            retrieval_item(
                100 + index,
                &format!("food.ramen.preference{index:02}"),
                &format!("Ramen preference number {index:02}"),
                &["food", "ramen"],
            )
        })
        .collect::<Vec<_>>();
    let first = select_memory_context(candidates.clone(), "food ramen", NOW)
        .expect("bounded context should be selected");
    candidates.reverse();
    let second = select_memory_context(candidates, "food ramen", NOW)
        .expect("reversed input should still select context");
    assert_eq!(context_text(&first), context_text(&second));
    assert_eq!(first.selected_count, MEMORY_MAX_ITEMS);
    assert!(context_text(&first).chars().count() <= MEMORY_MAX_CONTEXT_CHARS);
    assert!(first.estimated_tokens <= MEMORY_MAX_ESTIMATED_TOKENS);
    for index in 0..MEMORY_MAX_ITEMS {
        assert!(context_text(&first).contains(&format!("preference{index:02}")));
    }
    assert!(!context_text(&first).contains("preference05"));

    let mut corrected = likely;
    corrected.id = Uuid::from_u128(20);
    corrected.content = "Now prefers mild ramen".to_owned();
    corrected.updated_at = NOW;
    let mut stale = uncertain;
    stale.memory_key = corrected.memory_key.clone();
    stale.updated_at = NOW - 1;
    let correction_context = select_memory_context(vec![stale, corrected], "food ramen", NOW)
        .expect("corrected value should be selected");
    let correction_text = context_text(&correction_context);
    assert!(correction_text.contains("Now prefers mild ramen"));
    assert!(!correction_text.contains("May prefer miso ramen"));
}

#[tokio::test]
async fn memory_evaluation_postgres_enforces_guest_account_and_character_isolation() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let guest_a = store
        .create_guest_session()
        .await
        .expect("guest A should create");
    let guest_b = store
        .create_guest_session()
        .await
        .expect("guest B should create");
    let guest_a_owner = OwnerScope::from_session(&guest_a);
    let guest_b_owner = OwnerScope::from_session(&guest_b);
    save_memory(
        &store,
        guest_a_owner,
        "aiko",
        "food.ramen.owner",
        "Guest A likes spicy ramen",
    )
    .await;
    save_memory(
        &store,
        guest_b_owner,
        "aiko",
        "food.ramen.owner",
        "Guest B likes shoyu ramen",
    )
    .await;
    save_memory(
        &store,
        guest_a_owner,
        "synthetic_other_character",
        "food.ramen.owner",
        "Other character knows about curry ramen",
    )
    .await;

    assert_context_exactly_contains(
        retrieve_memory_context(&store, guest_a_owner, "aiko", "food ramen")
            .await
            .expect("guest A retrieval should query"),
        "Guest A likes spicy ramen",
        &["Guest B likes shoyu ramen", "Other character knows"],
    );
    assert_context_exactly_contains(
        retrieve_memory_context(&store, guest_b_owner, "aiko", "food ramen")
            .await
            .expect("guest B retrieval should query"),
        "Guest B likes shoyu ramen",
        &["Guest A likes spicy ramen", "Other character knows"],
    );
    assert_context_exactly_contains(
        retrieve_memory_context(
            &store,
            guest_a_owner,
            "synthetic_other_character",
            "food ramen",
        )
        .await
        .expect("other-character retrieval should query"),
        "Other character knows about curry ramen",
        &["Guest A likes spicy ramen", "Guest B likes shoyu ramen"],
    );

    let account_id = Uuid::new_v4();
    let account_session_a = registered_session(&store, account_id).await;
    let account_session_b = registered_session(&store, account_id).await;
    let account_owner_a = OwnerScope::from_session(&account_session_a);
    let account_owner_b = OwnerScope::from_session(&account_session_b);
    save_memory(
        &store,
        account_owner_a,
        "aiko",
        "food.ramen.account",
        "Account likes tonkotsu ramen",
    )
    .await;
    assert_context_exactly_contains(
        retrieve_memory_context(&store, account_owner_b, "aiko", "food ramen")
            .await
            .expect("same-account retrieval should query"),
        "Account likes tonkotsu ramen",
        &["Guest A likes spicy ramen", "Guest B likes shoyu ramen"],
    );
    let guest_context = retrieve_memory_context(&store, guest_a_owner, "aiko", "food ramen")
        .await
        .expect("guest isolation retrieval should query")
        .expect("guest A should retain its own memory");
    assert!(!context_text(&guest_context).contains("Account likes tonkotsu ramen"));

    cleanup_sessions(
        &store,
        &[
            guest_a.id,
            guest_b.id,
            account_session_a.id,
            account_session_b.id,
        ],
    )
    .await;
}

#[tokio::test]
async fn memory_evaluation_postgres_reinforces_and_replaces_corrected_evidence() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let session = store
        .create_guest_session()
        .await
        .expect("evaluation session should create");
    let owner = OwnerScope::from_session(&session);

    for statement in ["I like spicy ramen", "I still like spicy ramen"] {
        let chat = create_chat(&store, owner, "aiko").await;
        let user = append_turn(&store, owner, chat.id, statement).await;
        let job = store
            .claim_memory_extraction_job_for_test(user.id)
            .await
            .expect("capture job should query")
            .expect("capture job should exist");
        assert!(store
            .apply_memory_capture(job.id, &[captured_memory("Likes spicy ramen", false)])
            .await
            .expect("reinforcement should persist"));
    }
    let reinforced = store
        .list_memory_items(owner, "aiko")
        .await
        .expect("reinforced memory should list");
    assert_eq!(reinforced.len(), 1);
    assert!((reinforced[0].confidence - 0.85).abs() < 0.001);
    assert_eq!(
        store
            .list_memory_sources(owner, reinforced[0].id)
            .await
            .expect("reinforced sources should list")
            .len(),
        2
    );

    let correction_chat = create_chat(&store, owner, "aiko").await;
    let correction_user = append_turn(
        &store,
        owner,
        correction_chat.id,
        "Correction: I now prefer mild ramen",
    )
    .await;
    let correction_job = store
        .claim_memory_extraction_job_for_test(correction_user.id)
        .await
        .expect("correction job should query")
        .expect("correction job should exist");
    assert!(store
        .apply_memory_capture(
            correction_job.id,
            &[captured_memory("Now prefers mild ramen", true)],
        )
        .await
        .expect("correction should persist"));
    let corrected = store
        .list_memory_items(owner, "aiko")
        .await
        .expect("corrected memory should list");
    assert_eq!(corrected.len(), 1);
    assert_eq!(corrected[0].content, "Now prefers mild ramen");
    let sources = store
        .list_memory_sources(owner, corrected[0].id)
        .await
        .expect("corrected sources should list");
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].message_id, Some(correction_user.id));

    let selected = retrieve_memory_context(&store, owner, "aiko", "food ramen mild")
        .await
        .expect("corrected retrieval should query")
        .expect("corrected memory should be selected");
    let text = context_text(&selected);
    assert!(text.contains("Now prefers mild ramen"));
    assert!(!text.contains("Likes spicy ramen"));

    cleanup_sessions(&store, &[session.id]).await;
}

#[tokio::test]
async fn memory_evaluation_streaming_and_non_streaming_provider_context_is_identical_and_ordered() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let state = evaluation_state(store.clone());
    let session = store
        .create_guest_session()
        .await
        .expect("evaluation session should create");
    let owner = OwnerScope::from_session(&session);
    let chat = create_chat(&store, owner, "aiko").await;
    let source_user = append_turn(&store, owner, chat.id, "Earlier chat history").await;
    let memory = save_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.preference",
        "Likes synthetic spicy ramen",
    )
    .await;
    store
        .add_memory_source(owner, memory.id, chat.id, Some(source_user.id), 0.9)
        .await
        .expect("memory source should save")
        .expect("memory source should be valid");
    save_memory(
        &store,
        owner,
        "aiko",
        "music.jazz.preference",
        "SYNTHETIC_UNRELATED_PROVIDER_CONTENT",
    )
    .await;

    let latest = "Recommend food and ramen for my trip";
    let non_streaming = prepare_text_context_for_memory_evaluation(&state, owner, chat.id, latest)
        .await
        .expect("non-streaming context should prepare");
    let streaming = prepare_text_context_for_memory_evaluation(&state, owner, chat.id, latest)
        .await
        .expect("streaming context should prepare");
    assert_eq!(
        serde_json::to_value(&non_streaming).expect("context should serialize"),
        serde_json::to_value(&streaming).expect("context should serialize")
    );

    let provider = provider_messages_for_memory_evaluation("aiko_default", &streaming);
    let messages = provider
        .as_array()
        .expect("provider payload should contain an array");
    assert_eq!(messages.len(), 5);
    assert_eq!(messages[0]["role"], "system");
    assert!(messages[0]["content"]
        .as_str()
        .expect("character prompt should be text")
        .contains("Aiko"));
    assert_eq!(messages[1]["role"], "system");
    assert!(messages[1]["content"]
        .as_str()
        .expect("learned context should be text")
        .starts_with("LEARNED_CONTEXT_V1"));
    assert_eq!(messages[2]["role"], "user");
    assert_eq!(messages[2]["content"], "Earlier chat history");
    assert_eq!(messages[3]["role"], "assistant");
    assert_eq!(messages[4]["role"], "user");
    assert_eq!(messages[4]["content"], latest);

    let serialized = provider.to_string();
    assert!(serialized.contains("Likes synthetic spicy ramen"));
    assert!(!serialized.contains("SYNTHETIC_UNRELATED_PROVIDER_CONTENT"));
    assert!(!serialized.contains("memory_sources"));
    assert!(!serialized.contains("memory_extraction_jobs"));
    assert!(!serialized.contains("job_id"));
    assert!(!serialized.contains(&memory.id.to_string()));
    assert!(!serialized.contains(&source_user.id.to_string()));
    assert!(!serialized.contains("sk-synthetic"));

    cleanup_sessions(&store, &[session.id]).await;
}

#[test]
fn memory_expiration_application_boundary_is_exact_and_deterministic() {
    struct Scenario {
        name: &'static str,
        expires_at: Option<u64>,
        expected: bool,
    }

    let scenarios = [
        Scenario {
            name: "already expired",
            expires_at: Some(NOW - 1),
            expected: false,
        },
        Scenario {
            name: "expires exactly now",
            expires_at: Some(NOW),
            expected: false,
        },
        Scenario {
            name: "expires in the future",
            expires_at: Some(NOW + 1),
            expected: true,
        },
        Scenario {
            name: "does not expire",
            expires_at: None,
            expected: true,
        },
    ];

    for (index, scenario) in scenarios.into_iter().enumerate() {
        let mut item = retrieval_item(
            700 + index as u128,
            &format!("food.ramen.expiration_{index}"),
            "Likes synthetic ramen",
            &["food", "ramen"],
        );
        item.expires_at = scenario.expires_at;
        let selected = select_memory_context(vec![item], "food ramen", NOW).is_some();
        assert_eq!(selected, scenario.expected, "{}", scenario.name);
    }
}

#[tokio::test]
async fn memory_expiration_postgres_filters_expired_and_keeps_future_account_memory() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let account_id = Uuid::new_v4();
    let session = registered_session(&store, account_id).await;
    let owner = OwnerScope::from_session(&session);
    let now = now_unix_seconds();
    save_expiring_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.expired",
        "Expired synthetic ramen preference",
        Some(now.saturating_sub(60)),
    )
    .await;
    save_expiring_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.boundary",
        "Boundary synthetic ramen preference",
        Some(now),
    )
    .await;
    let future = save_expiring_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.future",
        "Future synthetic ramen preference",
        Some(now + 3_600),
    )
    .await;

    let candidates = store
        .find_memory_retrieval_candidates(
            owner,
            "aiko",
            &["food".to_owned(), "ramen".to_owned()],
            50,
        )
        .await
        .expect("expiration candidates should query");
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].id, future.id);
    let context = retrieve_memory_context(&store, owner, "aiko", "food ramen")
        .await
        .expect("expiration retrieval should query")
        .expect("future memory should be selected");
    let text = context_text(&context);
    assert!(text.contains("Future synthetic ramen preference"));
    assert!(!text.contains("Expired synthetic ramen preference"));
    assert!(!text.contains("Boundary synthetic ramen preference"));

    cleanup_sessions(&store, &[session.id]).await;
}

#[tokio::test]
async fn memory_expiration_source_deletion_never_reactivates_removed_or_expired_context() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let session = store
        .create_guest_session()
        .await
        .expect("deletion test session should create");
    let owner = OwnerScope::from_session(&session);
    let first_chat = create_chat(&store, owner, "aiko").await;
    let remaining_chat = create_chat(&store, owner, "aiko").await;
    let only_first = save_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.only_first",
        "Only first chat supports shio ramen",
    )
    .await;
    let shared = save_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.shared",
        "Both chats support miso ramen",
    )
    .await;
    let expired_shared = save_expiring_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.expired_shared",
        "Expired shared curry ramen",
        Some(now_unix_seconds().saturating_sub(60)),
    )
    .await;
    for (memory_id, chat_id, strength) in [
        (only_first.id, first_chat.id, 0.9),
        (shared.id, first_chat.id, 0.9),
        (shared.id, remaining_chat.id, 0.8),
        (expired_shared.id, first_chat.id, 0.9),
        (expired_shared.id, remaining_chat.id, 0.8),
    ] {
        store
            .add_memory_source(owner, memory_id, chat_id, None, strength)
            .await
            .expect("deletion fixture source should save")
            .expect("deletion fixture source should be valid");
    }

    let before = retrieve_memory_context(&store, owner, "aiko", "food ramen")
        .await
        .expect("pre-deletion retrieval should query")
        .expect("active pre-deletion memory should exist");
    let before_text = context_text(&before);
    assert!(before_text.contains("Only first chat supports shio ramen"));
    assert!(before_text.contains("Both chats support miso ramen"));
    assert!(!before_text.contains("Expired shared curry ramen"));

    assert!(store
        .delete_chat(owner, first_chat.id)
        .await
        .expect("first source chat should delete"));
    let retained_items = store
        .list_memory_items(owner, "aiko")
        .await
        .expect("retained memory should list");
    assert!(!retained_items.iter().any(|item| item.id == only_first.id));
    assert!(retained_items.iter().any(|item| item.id == shared.id));
    assert!(retained_items
        .iter()
        .any(|item| item.id == expired_shared.id));
    let after_first = retrieve_memory_context(&store, owner, "aiko", "food ramen")
        .await
        .expect("post-deletion retrieval should query")
        .expect("remaining supported memory should exist");
    let after_first_text = context_text(&after_first);
    assert!(!after_first_text.contains("Only first chat supports shio ramen"));
    assert!(after_first_text.contains("Both chats support miso ramen"));
    assert!(!after_first_text.contains("Expired shared curry ramen"));

    assert!(store
        .delete_chat(owner, remaining_chat.id)
        .await
        .expect("remaining source chat should delete"));
    assert!(store
        .list_memory_items(owner, "aiko")
        .await
        .expect("removed memories should list")
        .is_empty());
    assert!(retrieve_memory_context(&store, owner, "aiko", "food ramen")
        .await
        .expect("final retrieval should query")
        .is_none());

    cleanup_sessions(&store, &[session.id]).await;
}

#[tokio::test]
async fn memory_expiration_account_reset_removes_memory_and_all_queued_job_states() {
    let Some(store) = evaluation_store().await else {
        return;
    };
    let account_id = Uuid::new_v4();
    let first_session = registered_session(&store, account_id).await;
    let second_session = registered_session(&store, account_id).await;
    let owner = OwnerScope::from_session(&first_session);
    let reset_owner = OwnerScope::from_session(&second_session);
    let chat = create_chat(&store, owner, "aiko").await;
    save_memory(
        &store,
        owner,
        "aiko",
        "food.ramen.reset",
        "Account reset synthetic ramen memory",
    )
    .await;

    let pending_user = append_turn(&store, owner, chat.id, "Pending synthetic evidence").await;
    let retry_user = append_turn(&store, owner, chat.id, "Retry synthetic evidence").await;
    let processing_user =
        append_turn(&store, owner, chat.id, "Processing synthetic evidence").await;
    let retry_job = store
        .claim_memory_extraction_job_for_test(retry_user.id)
        .await
        .expect("retry job should query")
        .expect("retry job should claim");
    assert_eq!(
        store
            .fail_memory_extraction_job(retry_job.id, "synthetic_retry")
            .await
            .expect("retry state should save")
            .as_deref(),
        Some("retry")
    );
    let processing_job = store
        .claim_memory_extraction_job_for_test(processing_user.id)
        .await
        .expect("processing job should query")
        .expect("processing job should claim");

    assert!(
        retrieve_memory_context(&store, reset_owner, "aiko", "food ramen")
            .await
            .expect("pre-reset account retrieval should query")
            .is_some()
    );
    assert_eq!(
        store
            .reset_learned_context(reset_owner)
            .await
            .expect("account learned context should reset"),
        1
    );
    assert!(store
        .list_memory_items(owner, "aiko")
        .await
        .expect("reset memory should list")
        .is_empty());
    assert!(retrieve_memory_context(&store, owner, "aiko", "food ramen")
        .await
        .expect("post-reset retrieval should query")
        .is_none());
    for user_id in [pending_user.id, retry_user.id, processing_user.id] {
        assert!(store
            .claim_memory_extraction_job_for_test(user_id)
            .await
            .expect("removed job should query")
            .is_none());
    }
    assert!(!store
        .apply_memory_capture(
            processing_job.id,
            &[captured_memory("Stale processing evidence", false)],
        )
        .await
        .expect("stale processing capture should be rejected"));
    assert!(store
        .list_memory_items(reset_owner, "aiko")
        .await
        .expect("stale capture result should list")
        .is_empty());
    let retained_chat = store
        .get_chat(reset_owner, chat.id)
        .await
        .expect("retained account chat should query")
        .expect("reset should retain chat history");
    assert_eq!(retained_chat.messages.len(), 6);

    cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
}

async fn evaluation_store() -> Option<ChatStore> {
    let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
    ChatStore::connect(&database_url).await.ok()
}

fn evaluation_state(store: ChatStore) -> AppState {
    AppState {
        config: Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_voice_provider: "disabled".to_owned(),
            ai_voice_model: "gpt-4o-mini-tts".to_owned(),
            ai_voice_id: "marin".to_owned(),
            ai_voice_format: "mp3".to_owned(),
            ai_voice_instructions: None,
            ai_voice_speech_text_policy: "original".to_owned(),
            ai_transcription_provider: "disabled".to_owned(),
            ai_transcription_model: "gpt-4o-mini-transcribe".to_owned(),
            ai_transcription_prompt: None,
            database_url: "synthetic-test-database".to_owned(),
            openai_api_key: None,
            openai_base_url: "http://127.0.0.1:1/v1".to_owned(),
            openai_model: "synthetic-model".to_owned(),
            lmstudio_base_url: "http://127.0.0.1:1/v1".to_owned(),
            lmstudio_model: "synthetic-model".to_owned(),
            xai_api_key: None,
            xai_base_url: "http://127.0.0.1:1/v1".to_owned(),
            xai_model: "synthetic-model".to_owned(),
            voicevox_base_url: "http://127.0.0.1:1".to_owned(),
            voicevox_speaker_id: String::new(),
            voicevox_credit: None,
            voicevox_speed_scale: None,
            voicevox_pitch_scale: None,
            voicevox_intonation_scale: None,
            voicevox_volume_scale: None,
            voicevox_pre_phoneme_length: None,
            voicevox_post_phoneme_length: None,
            google_client_id: None,
            chat_attachment_upload_dir: "data/test-memory-evaluation".to_owned(),
            chat_attachment_max_bytes: 10 * 1024 * 1024,
            chat_attachment_max_images_per_message: 4,
            chat_attachment_max_width: 8192,
            chat_attachment_max_height: 8192,
            chat_attachment_max_pixels: 20_000_000,
        },
        http: Client::new(),
        rate_limiter: RateLimiter::default(),
        store,
        memory_telemetry: crate::memory::MemoryTelemetry::default(),
    }
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

async fn registered_session(store: &ChatStore, user_id: Uuid) -> SessionRecord {
    let guest = store
        .create_guest_session()
        .await
        .expect("account test session should create");
    let registered = store
        .promote_session_to_registered(guest.id, user_id)
        .await
        .expect("account test session should promote")
        .expect("account test session should exist");
    store
        .migrate_session_data_to_user(registered.id, user_id)
        .await
        .expect("account test data should migrate");
    registered
}

async fn create_chat(store: &ChatStore, owner: OwnerScope, character_id: &str) -> ChatRecord {
    store
        .create_chat(
            owner,
            character_id.to_owned(),
            if character_id == "aiko" {
                "aiko_default".to_owned()
            } else {
                "synthetic_profile".to_owned()
            },
        )
        .await
        .expect("evaluation chat should create")
}

async fn append_turn(
    store: &ChatStore,
    owner: OwnerScope,
    chat_id: Uuid,
    user_content: &str,
) -> StoredMessage {
    let now = now_unix_seconds();
    let user = StoredMessage {
        id: Uuid::new_v4(),
        role: AiRole::User,
        content: user_content.to_owned(),
        attachments: Vec::new(),
        created_at: now,
    };
    let assistant = StoredMessage {
        id: Uuid::new_v4(),
        role: AiRole::Assistant,
        content: "Synthetic acknowledgement".to_owned(),
        attachments: Vec::new(),
        created_at: now + 1,
    };
    store
        .append_chat_messages(owner, chat_id, user.clone(), assistant)
        .await
        .expect("evaluation turn should append")
        .expect("evaluation chat should exist");
    user
}

async fn save_memory(
    store: &ChatStore,
    owner: OwnerScope,
    character_id: &str,
    memory_key: &str,
    content: &str,
) -> crate::store::MemoryItemRecord {
    save_expiring_memory(store, owner, character_id, memory_key, content, None).await
}

async fn save_expiring_memory(
    store: &ChatStore,
    owner: OwnerScope,
    character_id: &str,
    memory_key: &str,
    content: &str,
    expires_at: Option<u64>,
) -> crate::store::MemoryItemRecord {
    store
        .upsert_memory_item(
            owner,
            NewMemoryItemRecord {
                character_id: character_id.to_owned(),
                memory_key: memory_key.to_owned(),
                kind: "preference".to_owned(),
                content: content.to_owned(),
                tags: vec!["food".to_owned(), "ramen".to_owned()],
                confidence: 0.9,
                importance: 0.8,
                last_reinforced_at: now_unix_seconds(),
                expires_at,
            },
        )
        .await
        .expect("evaluation memory should save")
}

fn captured_memory(content: &str, replaces_existing: bool) -> CapturedMemoryRecord {
    CapturedMemoryRecord {
        memory_key: "food.ramen.preference".to_owned(),
        kind: "preference".to_owned(),
        content: content.to_owned(),
        tags: vec!["food".to_owned(), "ramen".to_owned()],
        importance: 0.8,
        evidence_strength: 0.8,
        replaces_existing,
    }
}

fn assert_context_exactly_contains(
    context: Option<crate::memory::RetrievedMemoryContext>,
    expected: &str,
    excluded: &[&str],
) {
    let text = context_text(&context.expect("expected isolated memory context"));
    assert!(text.contains(expected));
    for value in excluded {
        assert!(!text.contains(value));
    }
}

async fn cleanup_sessions(store: &ChatStore, sessions: &[Uuid]) {
    for session_id in sessions {
        store
            .delete_session_for_test(*session_id)
            .await
            .expect("evaluation session should clean up");
    }
}
