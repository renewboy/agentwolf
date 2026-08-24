# Day state and speech-order acceptance

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for day state and speech-order acceptance.

## Evidence

Two retained browser-visible six-player Matches used real Trae ACP Sessions with Prompt contract
14:

| Mode       | Match ID                                      | Result           | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | ---------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-4e513a8d0346` | Wolves, day four |    368 |           49 |            328 |
| Sheriff    | `match-board-phase2-real-6-sher-95726af57785` | Wolves, day one  |    259 |           41 |            277 |

Both Matches ended with a zero-issue trajectory audit. Every player Turn completed; failed tools,
error Records, error diagnostics, and daytime-state Prompt failures were all zero. Every daytime
Prompt contained exactly one current-day statement plus the complete publicly living
nickname-seat-Player-ID roster.

The no-sheriff Match exercised both random and death-anchored mornings. Its peaceful first morning
started at Player 5 and proceeded counterclockwise `5 → 4 → 3 → 2 → 1 → 6`.
Later single-death mornings used Player 6 and Player 2 as their respective anchors and began from
the first living neighbor in the persisted counterclockwise direction. A separate real
no-sheriff Match exercised the opposite direction: after Player 2 died, the order was
`1 → 6 → 5 → 4 → 3`.

The sheriff Match placed all six candidates into the persisted campaign order
`6 → 1 → 2 → 3 → 4 → 5`, confirming a random first candidate followed by seat-order
rotation. All players remained original candidates, so no player was eligible to cast the sheriff
vote and the badge correctly became lost; daytime order then followed the no-sheriff fallback.
Deterministic engine coverage separately verified every living-Sheriff branch: single death uses
dead-left/dead-right, peaceful and multiple-death mornings use Sheriff-left/Sheriff-right, and the
Sheriff is appended as the final summary speaker in both directions. Multiple deaths without a
Sheriff use the lowest-seat death as anchor. Replay restored the emitted order exactly.
