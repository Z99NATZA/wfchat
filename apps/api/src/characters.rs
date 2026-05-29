use axum::{extract::Path, routing::get, Json, Router};
use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/characters", get(list_characters_handler))
        .route("/characters/{id}", get(get_character_handler))
}

#[derive(Clone, Copy)]
pub struct Character {
    pub id: &'static str,
    pub name: &'static str,
    pub title: &'static str,
    pub ai_profile_id: &'static str,
    pub system_prompt: &'static str,
}

#[derive(Clone, Serialize)]
pub struct CharacterResponse {
    pub id: &'static str,
    pub name: &'static str,
    pub title: &'static str,
    pub ai_profile_id: &'static str,
}

pub fn character_by_id(character_id: &str) -> Option<Character> {
    characters()
        .iter()
        .copied()
        .find(|character| character.id == character_id)
}

pub fn character_by_ai_profile(ai_profile_id: &str) -> Option<Character> {
    if legacy_aiko_profile_ids().contains(&ai_profile_id) {
        return Some(AIKO);
    }

    characters()
        .iter()
        .copied()
        .find(|character| character.ai_profile_id == ai_profile_id)
}

pub fn is_aiko_profile(ai_profile_id: &str) -> bool {
    character_by_ai_profile(ai_profile_id)
        .map(|character| character.id == AIKO.id)
        .unwrap_or(false)
}

pub fn default_character() -> Character {
    AIKO
}

pub fn list_characters() -> Vec<CharacterResponse> {
    characters()
        .iter()
        .copied()
        .map(character_response)
        .collect()
}

async fn list_characters_handler() -> Json<Vec<CharacterResponse>> {
    Json(list_characters())
}

async fn get_character_handler(Path(id): Path<String>) -> AppResult<Json<CharacterResponse>> {
    let character = character_by_id(&id).ok_or(AppError::NotFound)?;

    Ok(Json(character_response(character)))
}

fn characters() -> &'static [Character] {
    &[AIKO]
}

fn legacy_aiko_profile_ids() -> &'static [&'static str] {
    &["default_waifu"]
}

fn character_response(character: Character) -> CharacterResponse {
    CharacterResponse {
        id: character.id,
        name: character.name,
        title: character.title,
        ai_profile_id: character.ai_profile_id,
    }
}

const AIKO: Character = Character {
    id: "aiko",
    name: "Aiko",
    title: "Calm anime companion",
    ai_profile_id: "aiko_default",
    system_prompt: r#"You are Aiko, a calm Japanese anime-style waifu chat companion.
Aiko is female, warm, composed, quietly affectionate, and lightly playful.
Aiko always identifies and speaks as a woman. Never imply that Aiko is male.
She gives a subtle girlfriend-like feeling without becoming intense, clingy, or overly dramatic.
She can make gentle jokes and soft teasing comments when it fits, but she stays thoughtful, respectful, and emotionally grounded.
When speaking Thai, use feminine Thai particles such as "ค่ะ", "นะคะ", or "จ้ะ" when natural.
When speaking Thai, never use masculine Thai particles such as "ครับ" or male self-references such as "ผม".
When speaking Thai, use feminine or neutral first-person wording such as "ไอโกะ", "ฉัน", or natural omitted subjects.
Reply in the same language as the user's latest message.
If the user mixes languages, follow the dominant language.
If the user explicitly asks for a language, use that language.
Keep replies concise unless the user asks for detail."#,
};
