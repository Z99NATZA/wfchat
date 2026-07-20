# Folder Structure

```text
apps/
  api/
    migrations/       ordered PostgreSQL schema
    src/
      ai/providers/   chat provider adapters
      chat/           chat, attachment, streaming, and voice routes
      store/          PostgreSQL operations by domain
      app.rs           router and middleware
      auth.rs          sessions and profiles
      cafe.rs          lobby and realtime room hub
      memory.rs        automatic memory
      sync.rs          generic sync API
      voice.rs         speech providers
  web/
    e2e/               Playwright flows
    public/images/     versioned application assets
    src/
      app/             top-level providers and orchestration
      components/      reusable UI
      features/        avatar, cafe, and chat domains
      hooks/           app-level React hooks
      layouts/         shared shells
      pages/           route screens
      services/        browser/API infrastructure
      stores/          browser persistence and small stores
      i18n/            locale runtime and dictionaries
      types/           shared frontend contracts
      utils/           shared pure helpers
docs/
  lessons-learned/    reusable warnings from concrete failures
  release/            version history
```

Current behavior belongs in focused files directly under `docs/`. Do not put
roadmaps, implementation journals, or release history there. Reusable failure
lessons belong in `docs/lessons-learned/`; release summaries belong in
`docs/release/`.

Keep request flow close to its domain handler and persistence in the matching
`store/` module. Keep feature-specific frontend state and UI under the feature;
move code to shared layers only after it has a real cross-feature use.
