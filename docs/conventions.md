# Conventions

## TypeScript

- Prefer explicit domain types in `src/types`.
- Avoid `any`.
- Keep nullable behavior explicit.
- Use feature-local types only when they are not shared outside that feature.

## Naming

- Components: `PascalCase.tsx`
- Hooks: `useThing.ts`
- Services: `thingService.ts`
- Stores: `thingStore.ts`
- Utilities: `thing.ts`
- Data fixtures: `thingFixtures.ts`

## Imports

Use the `@/` alias for source imports:

```ts
import IconButton from "@/components/ui/IconButton";
```

Keep import direction predictable:

```text
app -> pages -> layouts/features -> shared layers
```

## Formatting

The project uses tabs with width 4. The `.editorconfig` file defines the editor baseline.

## Extending Safely

When adding a feature:

1. Create `src/features/<feature-name>`.
2. Start with `components`, `hooks`, `services`, and `data` only if each folder has a clear job.
3. Move reusable UI upward into `src/components/ui` only after a second real use case appears.
4. Move types into `src/types` only when they cross feature boundaries.
