# Information synchronization

Every match event has one immutable visibility descriptor and one monotonic sequence. A player session receives only visible events after its acknowledged cursor. The cursor advances after the final ACP turn response and never advances on uncertain delivery.

## Visibility classes

| Visibility | Recipients                                  | Typical events                                                                                                   |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Public     | Every living or observing participant       | phase, speeches, sheriff state, resolved ballots, death announcements, exile, winner, final role reveals         |
| Player set | Named Player IDs and god view               | role assignment, inspection result, potion use, selected wolf target for living wolves and Witch, delivery state |
| Faction    | Current members of one faction and god view | wolf roster, wolf council speech                                                                                 |
| God        | God view only                               | pending deaths, raw structured actions, delivery diagnostics                                                     |

The server filters events before serialization. Closed-eye and player clients never receive hidden payload fields.

Role-effect cues are derived only after this filtering step. A cue carries no additional game
state: its role, source, target, result variant, and sequence must all be reconstructable from the
visible event that produced it. Initial loads and view switches establish a cue watermark rather
than replaying historical effects.

## Phase matrix

| Phase              | Prompted sessions                            | Information delivered before action                                                                         | Published after completion                                                 |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Match bootstrap    | Every seat                                   | own role, faction knowledge, complete name-seat-ID roster, public board composition, actionable board rules | no public output                                                           |
| Guard action       | living Guard                                 | public events since cursor, own ability state                                                               | private guard intent; protection remains hidden                            |
| Wolf council       | living Werewolves, sequential                | public events plus prior wolf-only council speech                                                           | council speech to wolf faction and god view                                |
| Wolf kill vote     | living Werewolves, parallel barrier          | complete wolf council for every wolf                                                                        | resolved target to living Werewolves, living Witch, and god view           |
| Witch action       | living Witch                                 | public events and private current wolf target                                                               | private potion use                                                         |
| Seer action        | living Seer                                  | public events and own prior inspections                                                                     | private redirected inspection result                                       |
| Night resolution   | no Agent                                     | collected night intents                                                                                     | pending deaths to god view; day-start event public                         |
| Sheriff signup     | every publicly alive seat                    | all visible first-night events; first-night death identities remain unannounced                             | candidate decisions public                                                 |
| Sheriff speech     | standing candidates, sequential              | all earlier candidate speeches                                                                              | each speech public                                                         |
| Withdrawal         | standing candidates, parallel barrier        | complete candidate speech round                                                                             | withdrawal state public                                                    |
| Sheriff vote       | original non-candidates, parallel barrier    | complete campaign and withdrawal state                                                                      | individual ballots, totals, tie or elected sheriff public                  |
| Sheriff runoff     | tied candidates then original non-candidates | complete prior ballot and runoff speech                                                                     | runoff ballots and badge result public                                     |
| Death announcement | no Agent                                     | not applicable                                                                                              | night deaths or peaceful night public; identities and causes remain hidden |
| Badge transfer     | dead sheriff                                 | public death information and private action instruction                                                     | new sheriff or destroyed badge public                                      |
| Death trigger      | eligible dead role owner                     | public death state and private trigger eligibility                                                          | resolved skill and resulting deaths public                                 |
| Last words         | eligible dead players, sequential            | all visible events through prior death triggers                                                             | each last-words speech public                                              |
| Speech direction   | living sheriff                               | complete death, trigger, and last-words state                                                               | chosen order public                                                        |
| Day speech         | living seats, sequential                     | every earlier speech in the same round                                                                      | committed speech public and streamed while generated                       |
| Exile vote         | eligible voters, parallel barrier            | complete day speech round for every voter                                                                   | individual ballots and totals public                                       |
| Exile runoff       | tied speakers then non-tied voters           | prior ballot plus all runoff speeches                                                                       | runoff ballots and exile result public                                     |
| Day resolution     | no Agent                                     | not applicable                                                                                              | exile, Idiot reveal, death chain, winner, or next night public             |
| Match end          | no Agent                                     | settled victory state                                                                                       | winner first, followed by every player's final identity                    |

## Barrier semantics

Parallel stages freeze one event sequence before prompting any actor. Every prompt is rendered from that same sequence. Submitted actions remain in the action mailbox until all prompt turns finish, then enter the rule engine in seat order. This prevents one voter from observing another voter's unannounced action.

The action gateway marks a player Session as submitted immediately after accepting a valid structured action. God view and that player's own view can display the submitted state while the ACP turn closes; other projections receive no completion-order signal. A submitted action remains sealed inside the barrier until every eligible turn settles.

Sequential speech stages commit each speech immediately. The next speaker's prompt includes that speech once. A controlling spectator's visible speeches enter its browser playback queue without delaying later speakers in the same stage. The final speech holds the following phase until that queue reaches the final event sequence or the spectator skips it. Speech hidden from the controlling view does not create a playback hold, and controller disconnect releases the boundary. After release, the vote barrier renders every remaining speech to all voters before accepting ballots.

Natural speech uses the ACP reply stream rather than an action tool. Every speech prompt marks
announced deaths, living state, vote results, and phase results as fixed public facts while still
allowing strategic claims about identity, private information, and judgment. Wolf council prompts
accept discussion only; the attack target is requested later through the parallel vote barrier.

## Failure semantics

Each delivery is recorded as in-flight before `session/prompt`. A final ACP response acknowledges its sequence range. A timeout, process exit, or transport error leaves the delivery uncertain. The first failure for one player and phase replaces failed sessions and retries from a visible-history foundation without replaying old prompts to the same Session. A repeated failure pauses for operator action. Manual recovery advances past already delivered uncertain ranges and sends the current structured action contract.

Every foundation source history ends at the same sequence as its delivery cursor. The foundation renders each visible bootstrap fact exactly once: own role and abilities, complete roster, public role composition, actionable board rules, and private faction membership where applicable. A Werewolf receives the other current Werewolves and never receives itself as a teammate; a non-Werewolf receives no faction roster. Invisible events may occupy sequence numbers but never contribute hidden payloads.

## Terminal synchronization

`match.ended` publishes the winner before one final public role event for every seat. Every terminal projection exposes all final identities and reports every player Session as closed, including projections rebuilt after the runtime has been released.

The web client treats an ended snapshot as a terminal connection state, closes its spectator WebSocket, and does not reconnect. A missing or deleted Match returns HTTP 404, clears any retained snapshot, enters an unavailable state, and does not poll again. Transient closure for a running Match retains the last snapshot and uses bounded recovery.
