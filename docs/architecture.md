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

Backend code keeps request flows close to their owning route modules. `chat.rs`
owns chat flow, `auth.rs` owns sessions and login, `sync.rs` owns sync APIs,
`store.rs` owns PostgreSQL persistence, and `ai/*` owns provider adapters.

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
          -> apps/api/src/store.rs and apps/api/src/ai/*
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
- [Behavior history](behavior-history/README.md)
- [Database schema](database-schema.md)
- [Automatic memory](automatic-memory.md) - storage and automatic capture
  implemented; retrieval not implemented
- [PNGTuber and avatar runtime](pngtuber.md)
- [Theme system](theme.md)
- [Mobile viewport](mobile-viewport.md)
- [Docker runtime](docker.md)

## Maintenance Rule

When behavior changes, update the focused document that owns that behavior
first. If the change fixes a regression or replaces a previously intentional
behavior, add a short entry to the matching behavior history file. Update this
file only when the top-level system shape or document map changes.
