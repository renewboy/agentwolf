# Immersive match UI execution plan

## Goal

Deliver a fixed-height, immersive spectator interface with two anchored player rosters, an independently scrolling center feed, event-driven Agent presence, view-safe private status, coherent game-styled controls, and deterministic browser acceptance.

## Completed work

1. The match route uses a `100dvh` shell, left and right player medallion rosters, a center presence stage, an independently scrolling day-grouped feed, structured vote results, and responsive mobile roster behavior.
2. Player runtime status changes broadcast live snapshots. God, closed-eye, and player projections expose only their permitted runtime state, and view switching covers the current projection before replacement.
3. GSAP drives ambient waiting feedback, thinking rings, streamed-speech movement, phase transitions, result entry, and reduced-motion fallbacks.
4. `GameSelect` provides the application listbox with Portal placement, internal scrolling, keyboard navigation, typeahead, selection state, and focus restoration.
5. `ConfirmDialog` provides application-styled destructive confirmation with initial cancel focus, focus trapping, Escape handling, backdrop behavior, and trigger-focus restoration.
6. Artifact gates reject native Web selects and browser prompt APIs. Documentation gates validate the completed-plan structure and reject unfinished work inside completed plans.
7. Browser fixtures use a per-run namespace and remove all created Matches, Agent Profiles, and custom Agent Tools during teardown. Local test and acceptance records are empty after the suite finishes.
8. Current product, frontend, testing, acceptance, contributor, artifact, design-reference, and motion documents describe the implemented interface and constraints.

## Completion evidence

- `pnpm check` passes architecture, artifacts, documents, skills, type checking, lint, formatting, hygiene, duplication, coverage, and production build gates.
- Forty-two deterministic unit and integration scenarios pass with 87.01% line coverage and 70.97% branch coverage.
- Five Chromium acceptance scenarios pass, including listbox keyboard control, confirmation-dialog cancellation and deletion, projection safety, fixed-height scrolling, continuous thinking motion, reduced motion, and paused-match recovery.
- Browser measurements at 3456×1760, 1440×900, 1024×768, and 390×844 keep document height equal to viewport height and `window.scrollY` at zero.
- API readback after browser acceptance reports zero test Matches, zero test Agent Profiles, and zero custom test Agent Tools.
- The accepted design reference, generation prompt, and motion specification are stored in `docs/design/reference/`.
