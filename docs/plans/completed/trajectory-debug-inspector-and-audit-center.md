# Trajectory debug inspector and audit center

## Goal

Make player runtime diagnostics and trajectory records two explicit inspector modes, and move
trajectory-audit failures into a compact floating entry with a focused detail dialog.

## Completed work

- Added a developer-only, secret-safe player diagnostics DTO backed by the persisted Session launch
  snapshot, delivery cursor, trajectory usage, and latest Turn.
- Added `玩家配置` and `记录详情` tabs with player-card and trajectory-record automatic switching.
- Replaced the header audit banner with a freely draggable icon-only control, persisted position,
  issue-count badge, and a modal that preserves raw audit data and locates its player Turn.
- Added responsive, keyboard, focus-restoration, redaction, and browser coverage.

## Completion evidence

- `pnpm check` passed 44 test files and 174 tests, every static gate, and the production build.
- `pnpm test:e2e` passed all 24 Chromium scenarios.
- Real developer-mode browser acceptance passed at 1440×900 and 720×900 with zero horizontal
  overflow; 390×844 modal bounds are covered by Playwright.
- Player diagnostics exposed the persisted Session ID and current launch parameters while server
  coverage proved secret argument and configuration values remain absent.
