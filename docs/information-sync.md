# Information synchronization

Every match event has one immutable visibility descriptor and one monotonic sequence. A player session receives only visible events after its acknowledged cursor. The cursor advances after the final ACP turn response and never advances on uncertain delivery.

## Visibility classes

| Visibility | Recipients                                  | Typical events                                                                                                                                                |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public     | Every living or observing participant       | phase, speeches, sheriff state, resolved ballots, death announcements, exile, winner, final role reveals                                                      |
| Player set | Named Player IDs and god view               | role assignment, team roster, private inspection or copied-ability result, potion use, wolf council, wolf-kill ballots, regular attack target, delivery state |
| Faction    | Current members of one faction and god view | ruleset-defined whole-faction facts; current wolf-pack communication uses an explicit player set                                                              |
| God        | God view only                               | pending deaths, raw structured actions, delivery diagnostics                                                                                                  |

The server filters events before serialization. Closed-eye and player clients never receive hidden payload fields.
Private phase identifiers and labels follow the same boundary; unauthorized views receive a
generic night-action presentation.

Character name and portrait come from the immutable Match setup rather than a domain event. They
are public in every projection. Only the owning player receives the full Character card in its
foundation Prompt; every roster continues to bind players solely by nickname, seat, and Player ID.

Role-effect cues are derived only after this filtering step. A cue carries no additional game
state: its role, source, target, result variant, and sequence must all be reconstructable from the
visible event that produced it. Initial loads and view switches establish a cue watermark rather
than replaying historical effects.

## Phase matrix

| Phase                              | Prompted sessions                              | Information delivered before action                                                                                                                                      | Published after completion                                                                                                                  |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Match bootstrap                    | Every seat                                     | own role, optional own Character card with full-ability boundary, faction knowledge, complete nickname-seat-ID roster, detailed public rules for every role on the board | no public output                                                                                                                            |
| Guard action                       | living Guard                                   | public events since cursor, own ability state                                                                                                                            | private guard intent; protection remains hidden                                                                                             |
| Wolf council                       | living pack Werewolves, sequential             | public events plus prior pack-only council speech                                                                                                                        | council speech to the immutable pack actor set and god view                                                                                 |
| Wolf kill vote                     | living pack Werewolves, parallel barrier       | complete wolf council for every pack member; player target or explicit no-kill choice                                                                                    | detailed ballot and resolution to pack members and god view; selected attack target also to a living Witch whose antidote remains available |
| Awakened Hidden Wolf attack        | armed Awakened Hidden Wolf                     | public events, private armed state, ordinary or unused double-attack choice                                                                                              | complete targets privately; first target also to a living Witch with antidote                                                               |
| Witch action                       | living Witch                                   | public events; independent antidote and poison status; regular attack target only while antidote remains available; only currently legal potion choices, or pass         | private potion use                                                                                                                          |
| Seer action                        | living Seer                                    | public events and own prior inspections                                                                                                                                  | private redirected inspection result                                                                                                        |
| Magic Mirror action                | living Magic Mirror Girl                       | public events, exact-role ability state, and own prior exact-role inspections                                                                                            | private exact-role result and inspected-target history                                                                                      |
| Awakened Hidden Wolf copied action | living owner of an active copied night ability | public events, copied ability state and prior private results                                                                                                            | private copied-skill result                                                                                                                 |
| Awakened Hidden Wolf learning      | living unlearned owner                         | public events and one-time learning contract; pass remains legal                                                                                                         | private true Role, copied capability and exact-role mask                                                                                    |
| Night resolution                   | no Agent                                       | collected night intents                                                                                                                                                  | pending deaths to god view; day-start event public                                                                                          |
| Sheriff signup                     | every publicly alive seat                      | all visible first-night events; first-night death identities remain unannounced                                                                                          | candidate decisions public                                                                                                                  |
| Sheriff speech                     | standing candidates, sequential                | all earlier candidate speeches; the first candidate is selected by replay-stable random rotation                                                                         | each speech public                                                                                                                          |
| Withdrawal                         | standing candidates, parallel barrier          | complete candidate speech round                                                                                                                                          | withdrawal state public                                                                                                                     |
| Sheriff vote                       | original non-candidates, parallel barrier      | complete campaign and withdrawal state                                                                                                                                   | individual ballots, totals, tie or elected sheriff public                                                                                   |
| Sheriff runoff                     | tied candidates then original non-candidates   | complete prior ballot and runoff speech                                                                                                                                  | runoff ballots and badge result public                                                                                                      |
| Death announcement                 | no Agent                                       | not applicable                                                                                                                                                           | night deaths or peaceful night public; identities and causes remain hidden                                                                  |
| Badge transfer                     | dead sheriff                                   | public death information and the `submit_sheriff_action` transfer or destroy-badge contract                                                                              | new sheriff or destroyed badge public                                                                                                       |
| Death trigger                      | eligible dead role owner                       | public death state and private trigger eligibility                                                                                                                       | resolved skill and resulting deaths public                                                                                                  |
| Last words                         | eligible dead players, sequential              | all visible events through prior death triggers                                                                                                                          | each last-words speech public                                                                                                               |
| Speech direction                   | living sheriff                                 | current day, complete publicly living roster, and dead-left/dead-right or Sheriff-left/Sheriff-right choices                                                             | chosen anchor, direction, and order public                                                                                                  |
| Day speech                         | living seats, sequential                       | current day, complete publicly living roster, and every earlier speech in the same round                                                                                 | committed speech public and streamed while generated                                                                                        |
| Exile vote                         | eligible voters, parallel barrier              | complete day speech round for every voter                                                                                                                                | individual ballots and totals public                                                                                                        |
| Exile runoff                       | tied speakers then non-tied voters             | prior ballot plus all runoff speeches                                                                                                                                    | runoff ballots and exile result public                                                                                                      |
| Day resolution                     | no Agent                                       | not applicable                                                                                                                                                           | exile, Idiot reveal, death chain, winner, or next night public                                                                              |
| Match end                          | no Agent                                       | settled victory state                                                                                                                                                    | winner first, followed by every player's final identity                                                                                     |
| Postgame review                    | every seat, parallel frozen snapshot           | final identities, explicit MVP/SVP candidate pools, and one role-neutral five-dimension rubric                                                                           | each accepted review sheet public immediately; aggregate result only after every sheet                                                      |
| Postgame reflections               | every seat, sequential                         | final aggregate, awards, own score, and prior completed reflections                                                                                                      | each reflection streams and commits through the public speech presentation                                                                  |

## Barrier semantics

Parallel stages freeze one event sequence before prompting any actor. Every prompt is rendered from that same sequence. Submitted actions remain in the action mailbox until all prompt turns finish, then enter the rule engine in seat order. This prevents one voter from observing another voter's unannounced action.

The action gateway marks a player Session as submitted immediately after accepting a valid structured action. God view and that player's own view can display the submitted state while the accepted tool receipt closes the Prompt; other projections receive no completion-order signal. A submitted action remains sealed inside the barrier until every eligible turn settles.

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
The direct-speech stream ends at an embedded ACP role boundary or, once clean speech exists, the
first tool update. A strategy lookup may finish before speech starts; lookup output remains outside
the visible stream. Only one clean speech segment is broadcast and committed; a rejected tool may
be followed by a clean same-turn correction when no speech preceded it. Other generated text
remains available in the raw trajectory but cannot enter a Match event.
No-kill is represented by a null wolf ballot and wins only when it strictly outpolls every player
target. A highest-vote tie selects one of the tied player targets with a replay-stable random
choice. The detailed ballot remains sealed to pack-member and god projections; the Witch receives
only the selected attack target while her antidote remains available.
Every speech Prompt also carries the speech-length guidance snapshotted when its Match was created;
the gateway records the resulting speech without enforcing that length.

Public daytime action contracts derive interrupts from the acting player's capabilities. Ordinary
Werewolf can submit its no-target self-destruct, while White Wolf King can submit only its targeted
detonation. White Wolf King and its selected player enter the common death pipeline together; an
eligible Hunter target receives the death-trigger window before victory is evaluated. Closed-eye
and player projections receive only the public detonation result, while the raw action remains
subject to its event visibility.

Every daytime action Prompt states the current day and complete publicly living roster. A single
night death anchors a living Sheriff's left/right choice; peaceful and multiple-death mornings use
the Sheriff as anchor, and the Sheriff is always the final speaker. Without a Sheriff, the judge
uses the single death or lowest-seat death as anchor with a replay-stable random direction, or a
replay-stable random start and direction after a peaceful night.

The player process contributes no ambient user Memory, unrelated Skill catalog, repository
development instructions, or general-purpose mutation tool schema. Its provider adapter publishes
the player contract, two shared player Skills, local reads and read-only shell search, five
in-game action tools, and one postgame-review tool. Shell commands cannot write files, access the network, or request unsandboxed
execution. A new Match audit fails when a reported bootstrap context exceeds 12,000 tokens.

## Failure semantics

Structured action calls are validated before acceptance. Schema and game-rule rejections return a
failed tool result to the invoking Agent inside the active ACP turn, leave the action expectation
open, and do not change the engine, phase barrier, or delivery cursor. The Agent may submit a valid
replacement call in that turn. A final ACP response without an accepted action fails the turn.
When an interrupt ends a parallel phase, accepted actions that did not enter the engine are removed
from durable Session state before the next phase can prompt those players.

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
detailed public rules and role-introduction entry for every role present on the selected board,
global board policies,
private team knowledge where applicable, and the owning seat's immutable Character card when
selected. Character portrayal changes public expression only and cannot lower reasoning or action
quality. Public role rules contain no seat assignments. A pack Werewolf receives the other current
pack members and never receives itself as a teammate.
Awakened Hidden Wolf receives no pack roster and is absent from every pack member's roster.
Non-pack Roles receive no team roster. Invisible events may occupy sequence numbers but never
contribute hidden payloads.

## Terminal synchronization

`match.ended` publishes the winner before one final public role event for every seat. The postgame
coordinator then freezes explicit winning Player IDs without changing the event log. Review sheets
are public as soon as accepted, but the parallel rating Prompt remains fixed at the same terminal
snapshot. Before a seat's first rating Prompt, the server projects every public event after that
Session's regular acknowledged cursor through the terminal sequence. This status-independent
catch-up includes later public speeches across days, uses existing actor-aware Prompt rendering to
omit own speech, excludes all non-public events, and leaves the regular cursor unchanged. A retry
receives only the review continuation. The common terminal section contains the explicit winning
faction, winning players, and final role roster. Aggregate scores and awards appear only after all
seats submit. The Match feed records review start as a stable system message and places both award
vote totals and radar details before the reflections. Reflections are public sequential speech and
use the same stream, canonical text, and playback boundary as game speech.

The web client keeps an ended Match connected while review is counting down, collecting,
reflecting, or paused. Completed and skipped review expose all final identities, report every
Session as closed, close the spectator WebSocket, and do not reconnect. A missing or deleted Match
returns HTTP 404, clears any retained snapshot, enters an unavailable state, and does not poll
again. Transient closure for a running game or active review retains the last snapshot and uses
bounded recovery. When review is enabled, the first live snapshot whose Match status is `ended`
already contains the countdown record; an intermediate ended snapshot with a null review is never
published.
