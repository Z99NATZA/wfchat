# Memory API

Cross-session memory is separated from chat messages and scoped by session + persona.

## Endpoints

- `GET /api/personas/:persona_id/memory/facts`
- `POST /api/personas/:persona_id/memory/facts`
- `DELETE /api/memory/facts/:fact_id`
- `GET /api/personas/:persona_id/memory/summaries`
- `POST /api/personas/:persona_id/memory/summaries`
- `DELETE /api/memory/summaries/:summary_id`

## Notes

- Facts accept `content`, optional `confidence` (`0..1`), and optional `source_chat_id`.
- Summaries accept `summary` and optional `source_chat_id`.
- Delete operations are owner-scoped by current session header (`X-WFChat-Session`).
- During `POST /api/chats/:chat_id/messages`, backend prepends recent memory summaries/facts as a system memory note.
- Web UI supports list/create/delete for both memory facts and memory summaries in the details panel.
