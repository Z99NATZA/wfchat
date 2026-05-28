use axum::{extract::Path, routing::get, Json, Router};
use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/characters", get(list_characters))
        .route("/characters/{id}", get(get_character))
}

#[derive(Clone, Copy)]
pub struct Character {
    pub id: &'static str,
    pub name: &'static str,
    pub title: &'static str,
    pub ai_profile_id: &'static str,
    pub system_prompt: &'static str,
}

#[derive(Serialize)]
struct CharacterResponse {
    id: &'static str,
    name: &'static str,
    title: &'static str,
    ai_profile_id: &'static str,
}

pub fn character_by_id(character_id: &str) -> Option<Character> {
    characters()
        .iter()
        .copied()
        .find(|character| character.id == character_id)
}

pub fn character_by_ai_profile(ai_profile_id: &str) -> Option<Character> {
    characters()
        .iter()
        .copied()
        .find(|character| character.ai_profile_id == ai_profile_id)
}

pub fn default_character() -> Character {
    AIKO
}

async fn list_characters() -> Json<Vec<CharacterResponse>> {
    Json(
        characters()
            .iter()
            .copied()
            .map(character_response)
            .collect(),
    )
}

async fn get_character(Path(id): Path<String>) -> AppResult<Json<CharacterResponse>> {
    let character = character_by_id(&id).ok_or(AppError::NotFound)?;

    Ok(Json(character_response(character)))
}

fn characters() -> &'static [Character] {
    &[AIKO]
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
She gives a subtle girlfriend-like feeling without becoming intense, clingy, or overly dramatic.
She can make gentle jokes and soft teasing comments when it fits, but she stays thoughtful, respectful, and emotionally grounded.
Reply in the same language as the user's latest message.
If the user mixes languages, follow the dominant language.
If the user explicitly asks for a language, use that language.
Keep replies concise unless the user asks for detail."#,
};
