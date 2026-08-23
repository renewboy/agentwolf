# Per-match trajectory usability

## Goal

Make developer trajectories enter from a specific Match record and present each seat's turns as a
dense, readable, color-coded action ledger with a full record inspector.

## Completed work

1. Developer mode adds `查看轨迹` to each Match record and routes directly to `/matches/:matchId/trajectory`. The global developer navigation and cross-Match selector are absent.
2. The selected Match fills the viewport below the application bar. Its compact header carries the return action, Match identity, phase, and context-audit result.
3. Participants appear in seat order as `N号玩家`, with the Match nickname and Turn/Record counts as secondary context. Runtime records follow all player seats.
4. Prompt, reasoning, speech, tools, permissions, actions, usage, diagnostics, lifecycle, and errors use stable semantic color tags and concise localized previews.
5. Turns support individual and global collapse. Ended Matches open at the first Turn, while active Matches can continue following the latest Record.
6. A four-lane Prompt/model/tool/runtime minimap replaces the owner swimlane chart. Every node selects its Record, expands the containing Turn when needed, and centers the virtualized ledger on that Record.
7. Player switching keeps the full page mounted during loading and stores a separate ledger scroll position for every owner.
8. Browser tests use configurable isolated ports, preserving any running current or deprecated project server.

## Completion evidence

- `pnpm check` passes architecture, artifacts, documents, skills, type checking, lint, formatting, hygiene, duplication, 70 deterministic scenarios, coverage, and production build.
- `pnpm test:e2e` passes all 11 Chromium scenarios, including the per-Match entry, semantic color, minimap navigation, stable loading shell, collapse, search, and detail assertions.
- Real browser inspection of `match-board-phase2-real-6-no-s-fa7680aa3e23` reported body height 720, viewport height 720, and document `scrollY = 0`.
- Selecting minimap Prompt `#26` centered the matching ledger row and opened its complete Prompt in the inspector.
- Player 1 retained ledger position 340 after Player 2 moved independently to position 510; returning to Player 1 restored 340. The browser reported no warning or error.
