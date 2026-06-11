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

The streaming path is additive and does not replace the non-streaming endpoint:

```text
React
  -> POST /api/chats/:chat_id/messages/stream
    -> chat.rs
      -> ai/mod.rs
        -> ai/providers/<provider>.rs
      <- text/event-stream
```

See `docs/chat-sse-streaming.md` for the completed first-iteration SSE contract.

Clear chat flow:

```text
React
  -> DELETE /api/chats/:chat_id/messages
    -> chat.rs
      -> store.rs
```

This clears message history for the current chat while keeping the chat id and guest session.

## Files

`main.rs` starts the process, loads `.env`, configures logging, and binds the HTTP listener.

`app.rs` wires routes and middleware.

`config.rs` reads environment variables into one typed config.

`state.rs` stores shared dependencies such as config and the HTTP client.

`error.rs` maps application errors into HTTP responses.

`auth.rs` owns guest sessions, Google login, logout, `GET /api/auth/me`, and editable account profile updates.

`chat.rs` owns chat routes and the main chat flow.

`characters.rs` owns character-facing endpoints, the current static character registry, and character-specific system prompts.

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
registered can chat and sync across browsers/devices through account-scoped ownership
admin      can manage AI profiles, provider settings, and models
```

Auth uses an HTTP-only session cookie plus the `X-WFChat-Session` header for API ownership resolution. Frontend code should not store API keys or admin secrets.

Google identity and editable app profile are separate:

```text
auth_identities stores provider data such as Google email/name/avatar
user_profiles stores editable display_name/avatar_url used by the app UI
```

On first Google login, the backend seeds `user_profiles` from Google. Later logins update `auth_identities` but do not overwrite custom profile fields.

## AI Profiles

The chat UI should send `chat_id`, `character_id`, and message content. It should not send `provider` or `model`.

Backend routing should use an AI profile:

```text
character -> ai_profile -> provider/model/settings
```

This lets an admin switch OpenAI, LM Studio, xAI, or Claude without changing chat UI code.

## Characters

The active character registry is static code in `apps/api/src/characters.rs`.

Chat UI persona metadata is also sourced from this registry (`status`, `last_message`, `last_active_at`, `unread_count`, `avatar_url`) and exposed through `GET /api/chat-ui/config`.

Current character:

```text
aiko -> ai_profile_id: aiko_default
```

Aiko's prompt is intentionally character-specific and provider-independent. It defines her as a calm Japanese anime-style female waifu companion with a subtle girlfriend-like feeling, composed warmth, and light humor.

Prompt language rule:

```text
Reply in the same language as the user's latest message.
If the user mixes languages, follow the dominant language.
If the user explicitly asks for a language, use that language.
```

When adding more companions, add another `Character` entry first. The chat flow should continue to resolve:

```text
character_id -> Character -> ai_profile_id -> provider adapter
```
