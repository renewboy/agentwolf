# Trajectory debug inspector and audit center acceptance

Evidence time: 2026-08-28 00:12:55 +08:00

## Scope

Verify player and record inspector modes, secret-safe Session diagnostics, automatic tab switching,
the freely draggable audit control, player-linked raw issues, trajectory location, and responsive
layout.

## Evidence

- `pnpm check` passed 44 files and 174 tests, static gates, and the production build.
- `pnpm test:e2e` passed 24 Chromium scenarios, including player-card-to-player-tab,
  record-to-detail-tab, free-position drag persistence, player association, Turn location, focus
  restoration, and mobile bounds.
- Live browser inspection at 1440×900 and 720×900 showed full Agent configuration on player cards,
  Session diagnostics, the icon-only issue badge, and raw audit dialog without horizontal overflow.
- Server coverage redacted secret launch arguments and omitted literal environment and connection
  values from the developer DTO.
