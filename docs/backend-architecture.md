# Backend Architecture

The backend is a Rust Axum API in `apps/api`. It is designed to keep common request flows readable in a small number of files.

## Goals

- Chat UI does not know provider or model names.
- API keys stay in backend environment variables only.
- Guest users can chat without logging in.
- Registered users can be added later for sync and recovery.
- Admin-only endpoints own provider, model, and AI profile configuration.
- Provider adapters can be added without changing the chat UI contract.

## Request Flow

```text
React
  -> POST /api/chats/:chat_id/messages
    -> chat.rs
      -> ai/mod.rs
        -> ai/providers/<provider>.rs
```

The chat request sends user intent only. Provider and model selection happen inside the backend.

## Files

`main.rs` starts the process, loads `.env`, configures logging, and binds the HTTP listener.

`app.rs` wires routes and middleware.

`config.rs` reads environment variables into one typed config.

`state.rs` stores shared dependencies such as config and the HTTP client.

`error.rs` maps application errors into HTTP responses.

`auth.rs` is the future home for guest sessions, login, logout, and `GET /api/auth/me`.

`chat.rs` owns chat routes and the main chat flow.

`characters.rs` owns character-facing endpoints.

`admin.rs` owns admin-only AI profile and provider endpoints.

`ai/mod.rs` owns provider selection and the shared AI message types.

`ai/providers/*.rs` isolates OpenAI, LM Studio, xAI, and Anthropic implementation details.

## Planned Libraries

`axum`, `tokio`, `tower-http`: HTTP API and middleware.

`serde`, `serde_json`: request and response data.

`dotenvy`: local environment files.

`reqwest`: outbound provider API calls.

`thiserror`: application errors.

`tracing`, `tracing-subscriber`: structured logs.

`uuid`: ids for chats, users, sessions, and messages.

The current local implementation uses a JSON file store at `DATA_PATH`. Later, add `sqlx` when relational persistence is needed.

## Auth Model

```text
guest      can chat without login on the same browser/device
registered can chat and sync across devices
admin      can manage AI profiles, provider settings, and models
```

The first real auth implementation should use an HTTP-only session cookie. Frontend code should not store API keys or admin secrets.

## AI Profiles

The chat UI should send `chat_id`, `character_id`, and message content. It should not send `provider` or `model`.

Backend routing should use an AI profile:

```text
character -> ai_profile -> provider/model/settings
```

This lets an admin switch OpenAI, LM Studio, xAI, or Claude without changing chat UI code.
