# Vote collection and result presentation

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for vote collection and result presentation.

## Evidence

Match `match-board-quick-6-c5b673ee202c` entered its first exile vote at event 114. Four initial deliveries acknowledged by event 124; the remaining delivery entered bounded Session recovery, and the resolved ballots committed at event 162. The live-state contract now distinguishes context synchronization, active vote submission, accepted submission, and Session recovery.

A structured action acceptance emitted `submitted` before the ACP final response in integration coverage. Chromium sampling reported `data-presence-state="awaiting-actions"`, `已提交` for an accepted voter, `投票中` for a pending voter, stable orb and player-ring transforms, and a changing signal-rail transform/opacity sample.

Current API projection of the same Match renders its first result as `投票结算：2号以3票获得最高票。`, followed by `投2号：1号、5号、6号` and `投6号：2号、3号`. The second result renders `投5号：1号、6号` and `投6号：5号`. Neither title nor ballot row contains a player nickname.
