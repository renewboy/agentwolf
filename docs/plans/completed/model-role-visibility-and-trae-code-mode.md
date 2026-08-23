# Model, role, and Trae code-mode visibility

## Goal

Show each seat's configured model on Match and developer trajectory screens, present complete
player identities on the loopback-only trajectory screen, use one accessible role-color system,
and restore Trae's allowlisted MCP action transport without restoring coding capabilities.

## Completed work

1. `SeatView` carries the configured model. Active Matches use the model bound to the running
   player Session, while inactive records resolve the selected Agent Profile when it remains
   available.
2. One labeled role badge and asset-owned palette covers Villager, Werewolf, Seer, Witch, Hunter,
   Idiot, Guard, and the neutral hidden state across board management, Match setup, spectator, and
   trajectory surfaces.
3. Match cards place the model on its own readable row. Left-rail name, identity, Session status,
   and model metadata align to the left edge; the same fields align to the right edge on the right
   rail.
4. Trajectory participant rows place the complete role badge at the right edge of the seat-heading
   row and keep nickname, model, and Record count below it.
5. Read-only reconstruction of the retained nine-player Match traced the failed wolf-kill vote to
   Trae's disabled code-mode host. The affected `gpt-5.6-luna` Turns repeatedly routed their MCP
   action through `functions.exec`, while the DeepSeek voter called `submit_vote` directly.
6. Trae now explicitly enables `code_mode_host`. Its nested catalog remains the five AgentWolf MCP
   actions, while shell, unified exec, file, browser, search, plugin, hook, Memory, Skill, and Agent
   capabilities remain disabled. Codex continues to disable the code-mode host.
7. The live player-action smoke retains bounded stderr and thought detail when a model ends without
   an action, making future adapter and model failures directly diagnosable.
8. Product, architecture, frontend, testing, and acceptance documents describe the implemented
   behavior and verified boundary.

## Completion evidence

- The source Match `match-board-standard-9-2a52b746dce1` remained paused and unmodified. Players 5
  and 8 recorded 143 router diagnostics across four vote Turns, including 140 explicit
  `code-mode host is disabled` failures; their vote Prompt contract was correct.
- Three consecutive isolated Trae 0.201.5 / `gpt-5.6-luna` probes submitted a real wolf-kill vote
  with about 5.3k used context. A `functions.exec` request to run `pwd` returned `unavailable` and
  emitted no tool call. One earlier post-change probe ended without an action before smoke stderr
  capture was added and remains recorded as model non-compliance rather than transport success.
- Browser geometry measured at most 1px edge gaps for left-rail and right-rail
  name/identity/status/model fields, and 0px right-edge and vertical-center gaps for trajectory
  heading badges. Common model names rendered without overflow and browser warning/error logs were
  empty.
- Focused projector, player-policy, responsive Match, projection, board palette, and trajectory
  tests pass. `pnpm test:e2e` passes all 14 Chromium scenarios.
- `VITEST_MAX_WORKERS=1 pnpm check` passes architecture, artifacts, documentation, Skills, strict
  type checking, lint, formatting, hygiene, duplication, 102 deterministic tests with coverage,
  and the production build. `pnpm test:e2e` passes all 14 Chromium scenarios.
