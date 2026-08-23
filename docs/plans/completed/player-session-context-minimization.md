# Player session context minimization

## Goal

Start every built-in player Agent with an isolated game-only capability surface so global memories, unrelated skills, repository development instructions, plugins, and programming tools do not consume the Match context window.

## Completed work

- Added one provider-specific player launch policy shared by Trae CLI, Codex ACP, and Claude ACP.
- Trae receives per-process context overrides before `acp serve` and explicit game-tool allow/general-tool deny arguments after the subcommand.
- Codex receives an isolated `CODEX_CONFIG` with the AgentWolf model instruction file, no ambient context sources, coding features disabled, and the game MCP tool selection.
- Claude receives an empty built-in tool list, no ambient setting sources, and a compact AgentWolf system contract through `session/new` metadata.
- Codex's opaque MCP approval form is accepted only when the Codex-specific compatibility flag and explicit AgentWolf MCP allowlist are both present; ordinary opaque requests remain denied.
- Prompt contract 16 adds a 12,000-token bootstrap budget to trajectory audit while preserving reconstruction of earlier contracts.
- Replaced the provider-specific live probe with one generic player-action smoke that can measure usage, inspect tools, and test forbidden tool access.

## Completion evidence

- `pnpm check` passed 91 unit and integration scenarios across 26 files plus all architecture, artifact, document, skill, type, lint, format, hygiene, duplication, coverage, and production-build gates.
- A real Trae probe exposed exactly five AgentWolf MCP functions, submitted a wolf-kill vote, and reduced first-turn usage from 32,663 to 2,035 tokens.
- A real Codex probe submitted the same vote at 5,401 tokens; an attempted `functions.exec` produced no tool call.
- Real six-player Match `match-board-phase2-real-6-no-s-bdb87ae0b60d` completed in the browser with 369 events, 53 player Turns, 25 game-tool records, and no non-game tool or error Records.
- Its six foundation Turns used 2,578–2,604 tokens, all Sessions remained generation one, and the final 53-Turn trajectory audit reported zero issues.
