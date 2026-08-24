# Trajectory semantic integrity acceptance

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for trajectory semantic integrity acceptance.

## Evidence

Two retained browser-visible six-player Matches used real Trae ACP Sessions after the shared game
period and Prompt-integrity changes:

| Mode       | Match ID                                      | Result            | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | ----------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-d6f0b8874e89` | Wolves, day three |    282 |           39 |            255 |
| Sheriff    | `match-board-phase2-real-6-sher-68d5cfbb9b3b` | Village, day two  |    248 |           40 |            280 |

Both Matches reached `对局结束` and `对局记录已完整同步` in the browser. Their final
context audits covered all 79 player Turns and reported no issue. Every Turn completed with one
Prompt; duplicate Record IDs, failed tools, error Records, error diagnostics, role-primer
failures, own-speech reinjections, and streamed/committed speech mismatches were all zero.

Every player foundation contained exactly the four roles on the selected board—Villager,
Werewolf, Seer, and Witch—with faction, timing, target, usage, and policy details and no seat
assignment inside the public role-primer section. Werewolf foundations exposed self-destruct as a
callable ability and omitted the regular attack ability ID. The wolf attack stages completed with
`submit_vote`; the explicit night-action prohibition is version-gated and reconstructs earlier
stored Prompts exactly.

In the no-sheriff Match, Player 1 was the Witch and used the antidote on night one. Event 48 exposed
the regular attack target to Player 1 and the two living Werewolves. Events 182 and 268 excluded
Player 1 after the antidote was consumed, and the second-night Witch Prompt skipped the hidden
attack sequence while stating that no death target information was available. The Witch retained
the poison action. The sheriff Match completed signup, campaign speech, withdrawal, sheriff vote,
badge resolution, daytime play, and a second night.

The trajectory pages grouped calls under `开局`, `第1夜`, `上警`, and numbered days instead of
player-local Turn headings. Both pages filled the 720-pixel browser viewport with document
`scrollY = 0`, and each Match record remained the only entry point to its own trajectory. The final
Chromium suite passed all 11 scenarios.
