# Phase-two browser and trajectory acceptance

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for phase-two browser and trajectory acceptance.

## Evidence

Two retained browser-visible Matches used the saved six-player Seer/Witch boards and six real Trae
ACP Sessions backed by Doubao-Seed-2.1-Turbo:

| Mode       | Match ID                                      | Result             | Events | Player Turns | Tool calls |
| ---------- | --------------------------------------------- | ------------------ | -----: | -----------: | ---------: |
| No sheriff | `match-board-phase2-real-6-no-s-fa7680aa3e23` | Village, day three |    297 |           41 |         19 |
| Sheriff    | `match-board-phase2-real-6-sher-9583f8d865e2` | Wolves, day two    |    297 |           45 |         24 |

Both pages reached `对局结束` and `对局记录已完整同步` in the in-app browser. All 86 player
Turns completed, every structured tool record completed, both context audits returned no issue,
every Turn had exactly one Prompt, and no duplicate trajectory Record ID existed. Neither Match
recorded `submit_speech`, a failed tool, an error Record, or an error diagnostic. The browser
reported no warning or error for either page.

The stored Prompt contract preserved the exact visible event range for every Turn. Sheriff
campaign Prompts contained the pre-announcement privacy rule and no death announcement; public
speech Prompts fixed announced deaths, living state, votes, and phase results as shared table
facts. The current wolf-council Prompt delivered the discussion-only contract, omitted the
self-destruct interrupt, and deferred its target to the structured attack vote. Sheriff and public
daytime Werewolves received the formal `ability-werewolf-self-destruct` ID. The compatibility
speech tool remained unused, so streamed and committed speech shared the ACP response source.

Each real Match retained 20 Trae stderr warning diagnostics for provider Skill-budget,
submission-inbox, or shell-snapshot startup notices. They were inspected in the trajectory panel;
no warning represented a failed delivery, rejected game action, missing context, or browser error.

Each developer-mode Match record exposed `查看轨迹` and opened only that Match. The page rendered
players by seat with explicit nickname context, semantic Prompt/thought/speech/tool/action tags,
collapsible shared game periods, a four-lane clickable Record minimap, a viewport-filling
virtualized ledger, and a full detail inspector, and displayed `上下文审计通过`. Owner switching kept the page at
`scrollY = 0`, retained the full-height shell during loading, and restored per-owner ledger scroll.
Normal startup retained the same trajectory records while
returning 404 for developer reads. The custom-board browser flow saved, edited,
selected, started, and deleted a Seer/Witch board without changing built-ins or an existing Match
snapshot. Role-effect browser coverage observed sequence-keyed cues in full mode and verified the
reduced and off modes without residual transforms.
