# Shared Button Lessons Learned

## 2026-06-28 - Repeated text-button styles drifted across features

Context:
- Dialogs, settings, menus, and chat surfaces each needed command buttons.

Failed approach:
- Features repeated local Tailwind class strings for text buttons.

Problem observed:
- Padding, borders, hover, disabled, focus, and dark-mode behavior diverged and
  regressed when theme tokens changed.

Root cause:
- A shared control contract was copied as styling text instead of owned once.

Lesson:
- Do not duplicate common command-button styling across feature code.

## 2026-06-28 - Icon-only controls accumulated incompatible local variants

Context:
- Headers, drawers, messages, composers, and menus needed compact icon actions.

Failed approach:
- Icon controls mixed shared components, raw buttons, and feature-local visual
  classes.

Problem observed:
- Color, size, hover, focus, disabled, and dark-mode behavior drifted between
  otherwise equivalent actions.

Root cause:
- Visual ownership was split between a shared component and local overrides.

Lesson:
- Do not recreate common icon-control appearance independently inside features.
