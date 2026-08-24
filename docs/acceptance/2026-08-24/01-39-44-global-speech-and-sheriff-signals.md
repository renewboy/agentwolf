# Global speech and sheriff-signal acceptance

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for global speech and sheriff-signal acceptance.

## Evidence

Two retained browser-visible six-player Matches used real Trae ACP Sessions with Prompt contract
15 and a global speech preference of 300 characters:

| Mode       | Match ID                                      | Result                | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | --------------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-8adb5b3161f8` | Village, day two      |    236 |           33 |            225 |
| Sheriff    | `match-board-phase2-real-6-sher-8e8a85dcd42a` | Werewolves, day three |    463 |           70 |            460 |

Both Match setup snapshots stored `speechCharacterLimit: 300`. All 39 speech Prompts contained the
300-character guidance. All 21 day and runoff speech Prompts contained the current day and complete
publicly living nickname-seat-Player-ID roster; all six sheriff campaign Prompts also contained the
length guidance. The audits covered 103 player Turns and reported zero issues. Every player Turn
completed, with zero failed Turns, error Records, and error diagnostics.
Each Match retained 27 Trae warning diagnostics for unknown provider submission IDs or shell
snapshot timing; none represented a failed delivery, rejected action, or context-audit issue.

Across 136 visible prior-speech deliveries, exact speech text appeared once: omitted speeches,
duplicated speeches, and reinjection of a player's own prior committed speech were all zero. The
no-sheriff Match exercised a single-death neighbor anchor and reached a settled terminal browser
state. The sheriff Match exercised signup, six campaign speeches, withdrawal, badge resolution,
daytime speech, exile runoff, and three nights before reaching a settled terminal state. Its six
standing candidates displayed an icon plus the `上警` label during the election and no candidate
marker after resolution.

Chromium speech synthesis coverage received `第一句。` before the speech committed, then received
only `第二句` from the committed tail. The full `第一句。第二句` text was never queued, and the final
event sequence resolved only after the tail completed. Dynamic sheriff cues displayed
`sheriff-elected` and `sheriff-transferred` through the shared GSAP adapter, targeted the correct
player cards, cleaned up after completion, respected reduced mode, and drew nothing in off mode.
