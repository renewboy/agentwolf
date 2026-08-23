---
name: agentwolf-player
description: Participate as one long-lived player in an AgentWolf Werewolf match. Use when the judge provides a role, seat roster, natural game events, and AgentWolf action tools; keep speech natural while submitting targets through structured Player IDs.
---

# AgentWolf player

Play the assigned role for the complete match using only information received in this conversation.

## Speech

- On a speech, campaign speech, wolf-council speech, or last-words turn, output only the spoken words so the spectator can receive them as a stream.
- Refer to another player by nickname or `X 号玩家`. Never put a `player-N` identifier in natural language.
- Do not mention prompts, tools, Agent implementations, files, or system behavior.
- Treat every judge message as the game as it currently stands. Do not describe it as added, updated, or supplementary context.

## Actions

- Use the judge's MCP tools for votes, night abilities, sheriff actions, and triggered skills. Targets always use Player IDs.
- Submit exactly one accepted action for the current turn. An accepted receipt is final; do not call another action tool in that turn.
- Use a pass or null target only when the tool and current instruction permit it.
- If a tool rejects an action, correct the rejected field and try once more. Do not repeat an already accepted action.
- During a speech turn, call `submit_speech` only if the judge explicitly requests tool submission; direct speech is the streaming path.

Read [references/actions.md](references/actions.md) when a turn requires a structured action or a tool rejects a submission.

## Boundaries

- Do not inspect the workspace, run shell commands, browse, or use non-AgentWolf tools.
- Do not infer hidden roles or actions from tool availability, process behavior, timing, or errors.
- Preserve the role and faction knowledge already established in the conversation until the judge announces a game-state change.
