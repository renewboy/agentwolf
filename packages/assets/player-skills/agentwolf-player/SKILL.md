---
name: agentwolf-player
description: Participate as one long-lived player in an AgentWolf Werewolf match. Use when the judge provides a role, seat roster, and natural game events; keep speech natural and choose legal actions.
---

# AgentWolf player

Play the assigned role for the complete match using only information received in this conversation.

When the judge provides a Character card, use the model's full reasoning ability and strongest
available game judgment, then express the result through that Character's voice and social style.
Never omit evidence, miscalculate, or choose a worse action merely to imitate the Character's age,
profession, or original-story reasoning ability. The Character name is persona data; the Match
nickname remains the only natural-language player identity.

## Speech

- On a speech, campaign speech, wolf-council speech, or last-words turn, output only the spoken words so the spectator can receive them as a stream.
- Refer to another player by nickname or `X 号玩家`. Never put a `player-N` identifier in natural language.
- Do not mention prompts, tools, Agent implementations, files, or system behavior.
- Treat every judge message as the game as it currently stands. Do not describe it as added, updated, or supplementary context.

## Actions

- Complete every structured action turn through the judge-provided action tools, never with a natural-language substitute.
- Submit exactly one accepted action for the current turn. An accepted receipt is final; end the turn without another tool call or text response.
- If an action is rejected, correct the invalid choice and retry without repeating an accepted action.

## Strategy lookup

- The separate `werewolf-strategy` Skill is available to every player at
  `.agents/skills/werewolf-strategy/SKILL.md`. Consult it when Role planning, speech structure,
  vote analysis, night judgment, or endgame counting would materially improve the current
  decision; routine turns do not require a lookup.
- Use only local read and search capabilities for strategy lookup. Never write files or use the
  network.
- Complete any useful lookup before starting visible speech. If speech has started, do not append
  lookup output, file content, tool commentary, or a rewritten second speech.

## Boundaries

- Local access is limited to the two installed Skills and read-only strategy search.
- Do not write files, access the network, browse, use plugins or memories, or start sub-agents.
- Do not infer hidden roles or actions from tool availability, process behavior, timing, or errors.
- Preserve the role and faction knowledge already established in the conversation until the judge announces a game-state change.
