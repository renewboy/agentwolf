# Information synchronization

Every match event has one immutable visibility descriptor and one monotonic sequence. A player session receives only visible events after its acknowledged cursor. The cursor advances after the final ACP turn response and never advances on uncertain delivery.

## Visibility classes

| Visibility | Recipients                                  | Typical events                                                                                                                    |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Public     | Every living or observing participant       | phase, speeches, sheriff state, resolved ballots, death announcements, exile, winner, final role reveals                          |
| Player set | Named Player IDs and god view               | role assignment, inspection result, potion use, regular attack target for living Wolves and a Witch with antidote, delivery state |
| Faction    | Current members of one faction and god view | wolf roster, wolf council speech, wolf-kill ballots and grouped resolution                                                        |
| God        | God view only                               | pending deaths, raw structured actions, delivery diagnostics                                                                      |

The server filters events before serialization. Closed-eye and player clients never receive hidden payload fields.

Character name and portrait come from the immutable Match setup rather than a domain event. They
are public in every projection. Only the owning player receives the full Character card in its
foundation Prompt; every roster continues to bind players solely by nickname, seat, and Player ID.

Role-effect cues are derived only after this filtering step. A cue carries no additional game
state: its role, source, target, result variant, and sequence must all be reconstructable from the
visible event that produced it. Initial loads and view switches establish a cue watermark rather
than replaying historical effects.

## Phase matrix

| Phase              | Prompted sessions                            | Information delivered before action                                                                                                                                      | Published after completion                                                                                                                |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Match bootstrap    | Every seat                                   | own role, optional own Character card with full-ability boundary, faction knowledge, complete nickname-seat-ID roster, detailed public rules for every role on the board | no public output                                                                                                                          |
| Guard action       | living Guard                                 | public events since cursor, own ability state                                                                                                                            | private guard intent; protection remains hidden                                                                                           |
| Wolf council       | living Werewolves, sequential                | public events plus prior wolf-only council speech                                                                                                                        | council speech to wolf faction and god view                                                                                               |
| Wolf kill vote     | living Werewolves, parallel barrier          | complete wolf council for every wolf; player target or explicit no-kill choice                                                                                           | detailed ballot and resolution to Werewolves and god view; selected attack target also to a living Witch whose antidote remains available |
| Witch action       | living Witch                                 | public events; regular attack target only while the antidote remains available; no death target afterward                                                                | private potion use                                                                                                                        |
| Seer action        | living Seer                                  | public events and own prior inspections                                                                                                                                  | private redirected inspection result                                                                                                      |
| Night resolution   | no Agent                                     | collected night intents                                                                                                                                                  | pending deaths to god view; day-start event public                                                                                        |
| Sheriff signup     | every publicly alive seat                    | all visible first-night events; first-night death identities remain unannounced                                                                                          | candidate decisions public                                                                                                                |
| Sheriff speech     | standing candidates, sequential              | all earlier candidate speeches; the first candidate is selected by replay-stable random rotation                                                                         | each speech public                                                                                                                        |
| Withdrawal         | standing candidates, parallel barrier        | complete candidate speech round                                                                                                                                          | withdrawal state public                                                                                                                   |
| Sheriff vote       | original non-candidates, parallel barrier    | complete campaign and withdrawal state                                                                                                                                   | individual ballots, totals, tie or elected sheriff public                                                                                 |
| Sheriff runoff     | tied candidates then original non-candidates | complete prior ballot and runoff speech                                                                                                                                  | runoff ballots and badge result public                                                                                                    |
| Death announcement | no Agent                                     | not applicable                                                                                                                                                           | night deaths or peaceful night public; identities and causes remain hidden                                                                |
| Badge transfer     | dead sheriff                                 | public death information and private action instruction                                                                                                                  | new sheriff or destroyed badge public                                                                                                     |
| Death trigger      | eligible dead role owner                     | public death state and private trigger eligibility                                                                                                                       | resolved skill and resulting deaths public                                                                                                |
| Last words         | eligible dead players, sequential            | all visible events through prior death triggers                                                                                                                          | each last-words speech public                                                                                                             |
| Speech direction   | living sheriff                               | current day, complete publicly living roster, and dead-left/dead-right or Sheriff-left/Sheriff-right choices                                                             | chosen anchor, direction, and order public                                                                                                |
| Day speech         | living seats, sequential                     | current day, complete publicly living roster, and every earlier speech in the same round                                                                                 | committed speech public and streamed while generated                                                                                      |
| Exile vote         | eligible voters, parallel barrier            | complete day speech round for every voter                                                                                                                                | individual ballots and totals public                                                                                                      |
| Exile runoff       | tied speakers then non-tied voters           | prior ballot plus all runoff speeches                                                                                                                                    | runoff ballots and exile result public                                                                                                    |
| Day resolution     | no Agent                                     | not applicable                                                                                                                                                           | exile, Idiot reveal, death chain, winner, or next night public                                                                            |
| Match end          | no Agent                                     | settled victory state                                                                                                                                                    | winner first, followed by every player's final identity                                                                                   |

## Barrier semantics

Parallel stages freeze one event sequence before prompting any actor. Every prompt is rendered from that same sequence. Submitted actions remain in the action mailbox until all prompt turns finish, then enter the rule engine in seat order. This prevents one voter from observing another voter's unannounced action.

The action gateway marks a player Session as submitted immediately after accepting a valid structured action. God view and that player's own view can display the submitted state while the ACP turn closes; other projections receive no completion-order signal. A submitted action remains sealed inside the barrier until every eligible turn settles.

Sequential speech stages commit each speech immediately. The next speaker's prompt includes that
speech once. A player's own committed speech remains in its long-lived Session and is omitted from
later incremental prompts; every other required speech is delivered once. A controlling
spectator's visible speeches enter its browser playback queue without delaying later speakers in
the same stage. Complete sentences are queued from visible stream chunks; the committed event adds
only the unspoken tail and supplies the event sequence. The final speech holds the following phase
until that queue reaches the final event sequence or the spectator skips it. Speech hidden from the controlling view does not create a
playback hold, and controller disconnect releases the boundary. After release, the vote barrier
renders the remaining required speeches to all voters before accepting ballots.

Natural speech uses the ACP reply stream rather than an action tool. Every speech prompt marks
announced deaths, living state, vote results, and phase results as fixed public facts while still
allowing strategic claims about identity, private information, and judgment. Wolf council prompts
accept discussion only; the attack target is requested later through the parallel vote barrier.
No-kill is represented by a null wolf ballot and wins only when it strictly outpolls every player
target. A highest-vote tie selects one of the tied player targets with a replay-stable random
choice. The detailed ballot remains sealed to Werewolf and god projections; the Witch receives
only the selected attack target while her antidote remains available.
Every speech Prompt also carries the speech-length guidance snapshotted when its Match was created;
the gateway records the resulting speech without enforcing that length.

Every daytime action Prompt states the current day and complete publicly living roster. A single
night death anchors a living Sheriff's left/right choice; peaceful and multiple-death mornings use
the Sheriff as anchor, and the Sheriff is always the final speaker. Without a Sheriff, the judge
uses the single death or lowest-seat death as anchor with a replay-stable random direction, or a
replay-stable random start and direction after a peaceful night.

The player process contributes no ambient user Memory, unrelated Skill catalog, repository
development instructions, or general-purpose tool schema. Its provider adapter publishes only the
AgentWolf player contract and five game-action tools. A new Match audit fails when a reported
bootstrap context exceeds 12,000 tokens.

## Failure semantics

Structured action calls are validated before acceptance. Schema and game-rule rejections return a
failed tool result to the invoking Agent inside the active ACP turn, leave the action expectation
open, and do not change the engine, phase barrier, or delivery cursor. The Agent may submit a valid
replacement call in that turn. A final ACP response without an accepted action fails the turn.

Each delivery is recorded as in-flight before `session/prompt`. A final ACP response acknowledges
its sequence range. A timeout, process exit, or transport error leaves the delivery uncertain. The
first failure for one player and phase keeps the healthy connection or resumes the persisted
Session ID in another ACP process. The delivered range advances once, and the same logical Session
receives newly visible events plus the current stage and action contract. Other player Sessions are
unchanged. A repeated failure or failed resume pauses for operator action.

The action gateway persists an accepted structured action before returning its receipt. Recovery
consumes that action without another Prompt or submission. Every seat receives one foundation for
the Match; an interrupted foundation continues the preparation stage inside the same Session.

Every foundation source history ends at the same sequence as its delivery cursor. The foundation
renders each visible bootstrap fact exactly once: own role and abilities, complete roster, one
detailed public rules entry for every role present on the selected board, global board policies,
private faction membership where applicable, and the owning seat's immutable Character card when
selected. Character portrayal changes public expression only and cannot lower reasoning or action
quality. Public role rules contain no seat assignments. A
Werewolf receives the other current Werewolves and never receives itself as a teammate; a
non-Werewolf receives no faction roster. Invisible events may occupy sequence numbers but never
contribute hidden payloads.

## Terminal synchronization

`match.ended` publishes the winner before one final public role event for every seat. Every terminal projection exposes all final identities and reports every player Session as closed, including projections rebuilt after the runtime has been released.

The web client treats an ended snapshot as a terminal connection state, closes its spectator WebSocket, and does not reconnect. A missing or deleted Match returns HTTP 404, clears any retained snapshot, enters an unavailable state, and does not poll again. Transient closure for a running Match retains the last snapshot and uses bounded recovery.
