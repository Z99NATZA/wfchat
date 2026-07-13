# Architecture

This file is the entry point for WFChat architecture notes. Keep detailed
behavior in the focused documents linked below so implementation details do not
drift across multiple files.

## Stack Overview

```text
frontend: ReactJS + TypeScript in apps/web
backend: Rust + Axum in apps/api
database: PostgreSQL
runtime: Docker Compose for local full-stack runs
```

## System Shape

WFChat is split into a standalone browser frontend and a standalone HTTP API.
The frontend talks to the backend through `/api/*` only; provider keys, model
selection, persistence, auth, and sync ownership stay server-side.

Frontend code is feature-first under `apps/web/src`. App-level wiring stays in
`app`, route composition stays in `pages`, reusable UI stays in `components`,
browser infrastructure stays in `services`, persisted app-state helpers stay in
`stores`, and feature behavior stays inside `features/*`.

Backend code keeps request flows close to their owning route modules. `chat/*`
owns chat flow, `auth.rs` owns sessions and login, `sync.rs` owns sync APIs,
`store/*` owns PostgreSQL persistence by domain, and `ai/*` owns provider adapters.

## Runtime Flow

```text
apps/web/src/main.tsx
  -> apps/web/src/app/App.tsx
      -> routes in apps/web/src/pages/*
          -> shared layout in apps/web/src/layouts/AppLayout.tsx
          -> feature hooks/components in apps/web/src/features/*

browser
  -> /api/*
      -> apps/api/src/app.rs router
          -> auth/chat/sync/admin route modules
          -> apps/api/src/store/* and apps/api/src/ai/*
```

## Dependency Direction

Use this direction for frontend imports:

```text
app -> pages -> layouts/features -> components/hooks/services/stores/utils/types
```

Avoid importing upward. For example, shared UI in `components/ui` should not
import from `features/chat`.

Backend route modules should depend on shared state, store, config, and provider
adapters. Provider adapters should not depend on frontend concepts.

## Detailed Docs

- [Frontend architecture](frontend-architecture.md)
- [Backend architecture](backend-architecture.md)
- [State management](state-management.md)
- [App navigation](app-navigation.md)
- [Chat sessions](chat-sessions.md)
- [Chat SSE streaming](chat-sse-streaming.md)
- [Chat message rendering](chat-message-rendering.md)
- [Chat image attachments](chat-image-attachments.md)
- [Chat voice](chat-voice.md)
- [Sync system](sync-system.md)
- [Database schema](database-schema.md)
- [Automatic memory](automatic-memory.md) - storage, automatic capture, and
  bounded multilingual structured retrieval
- [PNGTuber and avatar runtime](pngtuber.md)
- [Theme system](theme.md)
- [Mobile viewport](mobile-viewport.md)
- [Docker runtime](docker.md)

## Maintenance Rule

Current documents describe the behavior implemented by the code and tests.
Verify implementation before changing a current claim. Failed approaches and
their reusable warnings live in `docs/lessons-learned/`, separate from current
domain documents. Update this file only when the top-level system shape or
current document map changes.
