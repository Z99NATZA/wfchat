use axum::{routing::get, Json, Router};
use serde::Serialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/characters", get(list_characters))
        .route("/characters/{id}", get(get_character))
}

#[derive(Serialize)]
struct CharacterResponse {
    id: &'static str,
    name: &'static str,
    ai_profile_id: &'static str,
}

async fn list_characters() -> Json<Vec<CharacterResponse>> {
    Json(vec![default_character()])
}

async fn get_character() -> Json<CharacterResponse> {
    Json(default_character())
}

fn default_character() -> CharacterResponse {
    CharacterResponse {
        id: "aiko",
        name: "Aiko",
        ai_profile_id: "default_waifu",
    }
}
