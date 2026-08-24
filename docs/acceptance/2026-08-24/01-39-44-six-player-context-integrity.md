# Six-player context integrity

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for six-player context integrity.

## Evidence

A real six-player Trae ACP match completed with GPT-5.4 and Gemini 3.1 Pro player Sessions. Its append-only log contained 229 contiguous domain events, 32 prompt deliveries and acknowledgements, 13 accepted structured action calls, and 26 submitted actions.

All six foundation prompts contained the exact public composition and complete roster. Player 1 received only Player 5 as a Werewolf teammate; Player 5 received only Player 1; the Hunter, Seer, and both Villagers received no wolf roster. Only the Seer received the inspection result, only the living Werewolves received the selected attack target, all structured calls used the AgentWolf action server, and committed speech contained no Player IDs. The redacted raw ACP stream contained no credential value.

The Hunter received the `ability-hunter-shot` death-skill contract and explicitly submitted `option: pass` with a null target. The engine recorded the ability use and no `hunter.shot`, confirming a player decision rather than an omitted trigger. `match.ended` was event 223; the six public final identities were events 224 through 229. No identity event occurred while the Match was running.

The production-entry terminal page exposed all six identities and six `已结束` Session labels. Its presence state was `ended`, connection state was `settled`, all six player-ring transforms remained stationary across two samples, document height equaled viewport height, page scroll stayed at zero, and the browser emitted no warning or error. The audit Match, Profiles, Tool, and all browser-test records were removed after verification.
