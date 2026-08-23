# AgentWolf phase-two execution plan

## Goal

Deliver persistent custom boards, a startup-gated developer trajectory inspector, and a reusable
role-effect system while preserving deterministic replay, visibility filtering, ACP recovery, and
the existing match experience.

## Completed work

1. Custom boards support 6 through 24 players, role counts, sheriff rules, and slaughter-all or slaughter-edge victory. Built-ins remain read-only; custom definitions support create, copy, edit, save, and delete.
2. Every Match stores an immutable board snapshot. SQLite schema migration preserves schema-one Matches and reconstructs their snapshots without consulting later catalog edits.
3. Every ACP delivery records a normalized Turn and stable Prompt, reasoning, message, tool, permission, action, usage, diagnostic, lifecycle, and error Records with capture-time redaction, size limits, and revisioned live updates.
4. Developer startup is loopback-only and exposes the developer navigation, summary, paginated ledger, live WebSocket, detail inspector, and deterministic context audit. Ordinary startup records trajectories while exposing no developer read surface.
5. Prompt contracts are versioned and exactly reconstructable. Natural speech uses the ACP reply, fixed public facts cannot be rewritten, wolf council accepts discussion only, and structured or interrupt abilities are limited to their exact engine phases.
6. Role events project visibility-safe effect cues for Werewolf attack and self-destruct, Seer inspection, Witch antidote and poison, Hunter shot, Idiot reveal, and Guard protection.
7. The Web effect controller consumes each visible sequence once, supports full, reduced, and off modes, cleans up on view and terminal transitions, and imports exact GSAP 3.15.0 only through the central adapter.
8. Architecture and artifact gates enforce dependency direction, developer-mode isolation, the animation runtime freeze, direct-import restrictions, role-effect catalog coverage, project controls, and current-state documentation.

## Completion evidence

- `pnpm check` passes architecture, artifacts, documents, skills, type checking, lint, formatting, hygiene, duplication, 70 deterministic scenarios across 24 files, coverage, and the production build.
- Coverage is 86.82% lines, 83.55% statements, 87.31% functions, and 72.61% branches.
- `pnpm test:e2e` passes 11 Chromium scenarios covering custom boards, the trajectory inspector, context-audit status, full/reduced/off role effects, live Match behavior, recovery, and teardown.
- Real six-player no-sheriff Match `match-board-phase2-real-6-no-s-fa7680aa3e23` completed in the browser with 297 events, 41 completed player Turns, 19 completed tools, and no audit issue, failed tool, error Record, error diagnostic, duplicate Record, or compatibility speech-tool call.
- Real six-player sheriff Match `match-board-phase2-real-6-sher-9583f8d865e2` completed in the browser with 297 events, 45 completed player Turns, 24 completed tools, and the same zero-issue trajectory result.
- The retained browser pages reported complete synchronization and no console warning or error. Their trajectory panels exposed provider startup warnings separately from game and transport errors.
- Prompt v9 real acceptance confirmed that wolf council delivered its discussion-only constraint, exposed no self-destruct interrupt, and deferred the target to the structured vote phase. Versioned audit continued to reconstruct the retained Prompt v8 sheriff Match exactly.
