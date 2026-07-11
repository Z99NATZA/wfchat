use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    config::Config,
    state::AppState,
    store::{CapturedMemoryRecord, MemoryExtractionJobRecord},
};

const WORKER_POLL_INTERVAL: Duration = Duration::from_secs(2);
const MAX_JOBS_PER_TICK: usize = 10;
const MAX_CANDIDATES: usize = 5;

static JOBS_COMPLETED: AtomicU64 = AtomicU64::new(0);
static JOBS_RETRIED: AtomicU64 = AtomicU64::new(0);
static JOBS_DEAD: AtomicU64 = AtomicU64::new(0);
static ITEMS_ACCEPTED: AtomicU64 = AtomicU64::new(0);
static ITEMS_REJECTED: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExtractorOutput {
    memories: Vec<ExtractorCandidate>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExtractorCandidate {
    action: CandidateAction,
    memory_key: String,
    kind: String,
    content: String,
    tags: Vec<String>,
    confidence: f32,
    importance: f32,
    evidence_strength: f32,
    evidence: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CandidateAction {
    Reinforce,
    Replace,
}

#[derive(Debug)]
struct ExtractionFailure {
    code: &'static str,
}

pub fn spawn_memory_capture_worker(state: AppState) {
    tokio::spawn(async move {
        loop {
            for _ in 0..MAX_JOBS_PER_TICK {
                match process_next_job(&state).await {
                    Ok(true) => {}
                    Ok(false) => break,
                    Err(error) => {
                        tracing::error!(error_code = error, "memory capture worker database error");
                        break;
                    }
                }
            }
            tokio::time::sleep(WORKER_POLL_INTERVAL).await;
        }
    });
}

async fn process_next_job(state: &AppState) -> Result<bool, &'static str> {
    let job = state
        .store
        .claim_memory_extraction_job()
        .await
        .map_err(|_| "claim_failed")?;
    let Some(job) = job else {
        return Ok(false);
    };

    let output = match extract_memories(state, &job).await {
        Ok(output) => output,
        Err(error) => {
            let status = state
                .store
                .fail_memory_extraction_job(job.id, error.code)
                .await
                .map_err(|_| "failure_state_update_failed")?;
            match status.as_deref() {
                Some("dead") => {
                    JOBS_DEAD.fetch_add(1, Ordering::Relaxed);
                    tracing::error!(
                        job_id = %job.id,
                        attempts = job.attempts,
                        error_code = error.code,
                        "memory extraction job exhausted retries"
                    );
                }
                Some(_) => {
                    JOBS_RETRIED.fetch_add(1, Ordering::Relaxed);
                    tracing::warn!(
                        job_id = %job.id,
                        attempts = job.attempts,
                        error_code = error.code,
                        "memory extraction job scheduled for retry"
                    );
                }
                None => {}
            }
            return Ok(true);
        }
    };

    let (accepted, rejected_count) = validate_output(output, &job.user_content);
    let accepted_count = accepted.len() as u64;
    if !state
        .store
        .apply_memory_capture(job.id, &accepted)
        .await
        .map_err(|_| "capture_persistence_failed")?
    {
        return Err("capture_job_disappeared");
    }

    JOBS_COMPLETED.fetch_add(1, Ordering::Relaxed);
    ITEMS_ACCEPTED.fetch_add(accepted_count, Ordering::Relaxed);
    ITEMS_REJECTED.fetch_add(rejected_count as u64, Ordering::Relaxed);
    tracing::info!(
        job_id = %job.id,
        attempts = job.attempts,
        accepted_count,
        rejected_count,
        jobs_completed = JOBS_COMPLETED.load(Ordering::Relaxed),
        jobs_retried = JOBS_RETRIED.load(Ordering::Relaxed),
        jobs_dead = JOBS_DEAD.load(Ordering::Relaxed),
        items_accepted = ITEMS_ACCEPTED.load(Ordering::Relaxed),
        items_rejected = ITEMS_REJECTED.load(Ordering::Relaxed),
        "memory extraction job completed"
    );
    Ok(true)
}

async fn extract_memories(
    state: &AppState,
    job: &MemoryExtractionJobRecord,
) -> Result<ExtractorOutput, ExtractionFailure> {
    if state.config.ai_provider == "mock" {
        return Ok(ExtractorOutput {
            memories: Vec::new(),
        });
    }

    let (base_url, api_key, model) = extraction_provider(&state.config)?;
    let request = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": extractor_prompt()},
            {"role": "user", "content": job.user_content}
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "memory_extraction",
                "strict": true,
                "schema": extractor_json_schema()
            }
        }
    });
    let mut request_builder = state
        .http
        .post(format!(
            "{}/chat/completions",
            base_url.trim_end_matches('/')
        ))
        .json(&request);
    if let Some(api_key) = api_key {
        request_builder = request_builder.bearer_auth(api_key);
    }
    let response = request_builder
        .send()
        .await
        .map_err(|_| ExtractionFailure {
            code: "provider_unavailable",
        })?;
    if !response.status().is_success() {
        return Err(ExtractionFailure {
            code: "provider_rejected",
        });
    }
    let response: Value = response.json().await.map_err(|_| ExtractionFailure {
        code: "invalid_provider_response",
    })?;
    let content = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or(ExtractionFailure {
            code: "missing_structured_output",
        })?;
    serde_json::from_str(content).map_err(|_| ExtractionFailure {
        code: "invalid_structured_output",
    })
}

fn extraction_provider(config: &Config) -> Result<(&str, Option<&str>, &str), ExtractionFailure> {
    match config.ai_provider.as_str() {
        "openai" => Ok((
            &config.openai_base_url,
            config.openai_api_key.as_deref(),
            &config.openai_model,
        )),
        "xai" => Ok((
            &config.xai_base_url,
            config.xai_api_key.as_deref(),
            &config.xai_model,
        )),
        "lmstudio" => Ok((&config.lmstudio_base_url, None, &config.lmstudio_model)),
        _ => Err(ExtractionFailure {
            code: "unsupported_extraction_provider",
        }),
    }
}

fn extractor_prompt() -> &'static str {
    "Extract at most five durable, explicitly stated user facts for future companion conversations. Return only the requested JSON schema. Use stable lowercase dotted memory keys. Allowed kinds: preference, profile, goal, constraint, plan, experience. The evidence field must be a short exact quote from the user message. Use action=reinforce for a new or repeated fact and action=replace only when the user explicitly corrects a prior value. Never extract assistant claims, guesses, secrets, credentials, authentication data, financial data, contact details, medical identifiers, temporary turn instructions, fleeting moods, or low-value details. Return an empty memories array when nothing is safe and durable."
}

fn extractor_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["memories"],
        "properties": {
            "memories": {
                "type": "array",
                "maxItems": MAX_CANDIDATES,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "action", "memory_key", "kind", "content", "tags",
                        "confidence", "importance", "evidence_strength", "evidence"
                    ],
                    "properties": {
                        "action": {"type": "string", "enum": ["reinforce", "replace"]},
                        "memory_key": {"type": "string", "minLength": 3, "maxLength": 80},
                        "kind": {"type": "string", "enum": ["preference", "profile", "goal", "constraint", "plan", "experience"]},
                        "content": {"type": "string", "minLength": 3, "maxLength": 240},
                        "tags": {"type": "array", "maxItems": 6, "items": {"type": "string", "minLength": 1, "maxLength": 32}},
                        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "importance": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "evidence_strength": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "evidence": {"type": "string", "minLength": 3, "maxLength": 200}
                    }
                }
            }
        }
    })
}

fn validate_output(
    output: ExtractorOutput,
    user_content: &str,
) -> (Vec<CapturedMemoryRecord>, usize) {
    let total = output.memories.len();
    let mut accepted = Vec::new();
    if total > MAX_CANDIDATES || contains_sensitive_data(user_content) {
        return (accepted, total);
    }

    for candidate in output.memories {
        if let Some(candidate) = validate_candidate(candidate, user_content) {
            if !accepted
                .iter()
                .any(|item: &CapturedMemoryRecord| item.memory_key == candidate.memory_key)
            {
                accepted.push(candidate);
            }
        }
    }
    let rejected = total.saturating_sub(accepted.len());
    (accepted, rejected)
}

fn validate_candidate(
    candidate: ExtractorCandidate,
    user_content: &str,
) -> Option<CapturedMemoryRecord> {
    let memory_key = candidate.memory_key.trim().to_ascii_lowercase();
    let kind = candidate.kind.trim().to_ascii_lowercase();
    let content = candidate.content.trim().to_owned();
    let evidence = candidate.evidence.trim();
    if !valid_memory_key(&memory_key)
        || !matches!(
            kind.as_str(),
            "preference" | "profile" | "goal" | "constraint" | "plan" | "experience"
        )
        || content.len() < 3
        || content.len() > 240
        || evidence.len() < 3
        || evidence.len() > 200
        || !normalized(user_content).contains(&normalized(evidence))
        || !candidate.confidence.is_finite()
        || candidate.confidence < 0.65
        || candidate.confidence > 1.0
        || !candidate.importance.is_finite()
        || candidate.importance < 0.45
        || candidate.importance > 1.0
        || !candidate.evidence_strength.is_finite()
        || candidate.evidence_strength < 0.6
        || candidate.evidence_strength > 1.0
        || contains_sensitive_data(&memory_key)
        || contains_sensitive_data(&content)
        || contains_sensitive_data(evidence)
        || contains_temporary_detail(&content)
        || contains_temporary_detail(evidence)
    {
        return None;
    }

    let mut tags = Vec::new();
    for tag in candidate.tags {
        let tag = tag.trim().to_ascii_lowercase();
        if tag.is_empty()
            || tag.len() > 32
            || !tag
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-')
            || tags.contains(&tag)
        {
            return None;
        }
        tags.push(tag);
    }

    Some(CapturedMemoryRecord {
        memory_key,
        kind,
        content,
        tags,
        importance: candidate.importance,
        evidence_strength: candidate.evidence_strength,
        replaces_existing: matches!(candidate.action, CandidateAction::Replace),
    })
}

fn valid_memory_key(key: &str) -> bool {
    key.len() <= 80
        && key.split('.').count() >= 2
        && key.split('.').all(|segment| {
            !segment.is_empty()
                && segment.chars().all(|ch| {
                    ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-'
                })
        })
}

fn normalized(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn contains_sensitive_data(value: &str) -> bool {
    let lower = value.to_lowercase();
    const SENSITIVE_TERMS: &[&str] = &[
        "password",
        "passcode",
        "pin code",
        "api key",
        "private key",
        "secret key",
        "seed phrase",
        "access token",
        "refresh token",
        "bearer token",
        "credit card",
        "debit card",
        "bank account",
        "routing number",
        "swift code",
        "crypto wallet",
        "social security",
        "รหัสผ่าน",
        "รหัสพิน",
        "บัตรเครดิต",
        "บัตรเดบิต",
        "เลขบัญชี",
        "คีย์ลับ",
    ];
    if SENSITIVE_TERMS.iter().any(|term| lower.contains(term))
        || lower.contains("sk-")
        || lower.contains("xoxb-")
        || lower.contains("ghp_")
        || lower.contains("eyjhb")
    {
        return true;
    }

    let mut digit_run = 0;
    for ch in lower.chars() {
        if ch.is_ascii_digit() {
            digit_run += 1;
            if digit_run >= 12 {
                return true;
            }
        } else if !matches!(ch, ' ' | '-') {
            digit_run = 0;
        }
    }
    false
}

fn contains_temporary_detail(value: &str) -> bool {
    let lower = value.to_lowercase();
    const TEMPORARY_TERMS: &[&str] = &[
        "right now",
        "for now",
        "just today",
        "today only",
        "tonight",
        "this week",
        "this response",
        "this turn",
        "temporarily",
        "ตอนนี้",
        "วันนี้เท่านั้น",
        "คืนนี้",
        "สัปดาห์นี้",
        "คำตอบนี้",
        "ชั่วคราว",
    ];
    TEMPORARY_TERMS.iter().any(|term| lower.contains(term))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(content: &str, evidence: &str) -> ExtractorCandidate {
        ExtractorCandidate {
            action: CandidateAction::Reinforce,
            memory_key: "food.spice.preference".to_owned(),
            kind: "preference".to_owned(),
            content: content.to_owned(),
            tags: vec!["food".to_owned(), "spicy".to_owned()],
            confidence: 0.9,
            importance: 0.8,
            evidence_strength: 0.9,
            evidence: evidence.to_owned(),
        }
    }

    #[test]
    fn accepts_grounded_durable_candidate() {
        let output = ExtractorOutput {
            memories: vec![candidate("Likes spicy ramen", "I always like spicy ramen")],
        };
        let (accepted, rejected) =
            validate_output(output, "When travelling, I always like spicy ramen");
        assert_eq!(accepted.len(), 1);
        assert_eq!(rejected, 0);
    }

    #[test]
    fn rejects_unsupported_inference_and_low_value_candidate() {
        let mut inferred = candidate("Likes hiking", "I like hiking");
        inferred.importance = 0.2;
        let output = ExtractorOutput {
            memories: vec![inferred, candidate("Likes ramen", "I love sushi")],
        };
        let (accepted, rejected) = validate_output(output, "I like hiking today");
        assert!(accepted.is_empty());
        assert_eq!(rejected, 2);
    }

    #[test]
    fn rejects_secret_or_financial_source_without_persisting_other_candidates() {
        for source in [
            "My password is hunter2 and I like ramen",
            "My credit card is 4111 1111 1111 1111 and I like ramen",
            "รหัสผ่านของฉันคือ abc และฉันชอบราเม็ง",
        ] {
            let output = ExtractorOutput {
                memories: vec![candidate("Likes ramen", "I like ramen")],
            };
            let (accepted, rejected) = validate_output(output, source);
            assert!(accepted.is_empty());
            assert_eq!(rejected, 1);
        }
    }

    #[test]
    fn strict_schema_rejects_unknown_fields() {
        let raw = r#"{"memories":[],"unexpected":true}"#;
        assert!(serde_json::from_str::<ExtractorOutput>(raw).is_err());
    }

    #[test]
    fn rejects_temporary_turn_detail() {
        let output = ExtractorOutput {
            memories: vec![candidate(
                "Wants short replies for now",
                "For now, give me short replies",
            )],
        };
        let (accepted, rejected) = validate_output(output, "For now, give me short replies");
        assert!(accepted.is_empty());
        assert_eq!(rejected, 1);
    }
}
