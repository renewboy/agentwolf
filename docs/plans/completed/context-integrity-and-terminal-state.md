# Context integrity and terminal-state execution plan

## Goal

Deliver complete, visibility-safe player context for every Agent turn and a stable terminal spectator state that stops live recovery, reveals all final identities, closes player status, and leaves no residual waiting animation.

## Completed work

1. Bootstrap delivery uses the complete event history through its cursor. Every foundation includes the player's own role and abilities, the complete nickname-seat-ID roster, the public board composition, actionable board rules, and permitted faction knowledge.
2. Werewolf foundations name only the other Werewolves. Non-Werewolf foundations contain no wolf roster. Wolf-kill validation rejects faction teammates as targets.
3. Night target, inspection, guard, potion, speech-order, vote-resolution, and Hunter events have explicit natural narration and visibility boundaries. Parallel actions remain sealed until their phase barrier resolves.
4. Death and exile keep identities hidden in running projections. The terminal phase publishes the winner and then one public final identity event for every player. Agent prompts contain no system identity-publication policy.
5. Hunter death always enters its structured skill turn. A pass is recorded as the Agent's explicit action and produces no shot event; a submitted target produces the corresponding public shot.
6. Ended projections expose all roles and derive every Session as closed. Ended clients settle and close their WebSocket; deleted Match IDs return 404 and enter a non-retrying unavailable state.
7. Presence motion tracks the complete Session-status signature. Every transition kills existing orb, waveform, signal, and player-ring tweens before starting the currently applicable feedback, so terminal state has no residual loop.
8. Unit, integration, browser, artifact, architecture, documentation, formatting, lint, hygiene, duplication, coverage, and production-build gates encode the current behavior.

## Completion evidence

- `pnpm check` passes all deterministic gates with 17 test files and 51 passing scenarios. Coverage is 88.06% lines, 84.52% statements, 86.46% functions, and 72.22% branches.
- `pnpm test:e2e` passes six Chromium scenarios, including fixed viewport scrolling, active thinking motion, terminal tween cleanup, full terminal identity display, settled WebSocket behavior, and missing-Match request shutdown.
- A real six-player Trae ACP match completed with 229 contiguous domain events, 32 acknowledged prompt deliveries, 13 accepted structured tool calls, and 26 submitted actions. Automated raw-stream audit reported no visibility, cursor, tool, speech-ID, teammate-target, or credential-redaction errors.
- In that run, `match.ended` was sequence 223 and the six final identity events were sequences 224 through 229. The Hunter received its death-skill contract and explicitly submitted a pass with a null target.
- Production-entry browser inspection reported `data-presence-state="ended"`, connection state `settled`, six visible identities, six `已结束` Session labels, six stationary player rings, viewport-equal document height, zero page scroll, and no console warning or error.
- Temporary audit Match, Agent Profiles, Agent Tool, and browser-test records were removed after evidence collection.
