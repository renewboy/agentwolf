# Information synchronization architecture

## Responsibility

This module defines which facts each viewer and player may receive, how event cursors advance, when
parallel and sequential work becomes visible, how speech playback gates phase progression, and how
clients recover or settle.

The engine owns event visibility; the server projector filters before serialization; the Prompt
runtime and Web client consume only their projected views.

## Visibility classes

| Class      | Recipients                            | Typical facts                                                    |
| ---------- | ------------------------------------- | ---------------------------------------------------------------- |
| Public     | every view and player                 | announcements, public speech, public votes, deaths, final result |
| God        | god view only                         | complete private actions and diagnostic state                    |
| Player set | named players plus god view           | actor-private results and selected team knowledge                |
| Faction    | ruleset-defined members plus god view | facts intentionally shared with a whole faction                  |

Visibility applies to phase identity as well as event payload. A viewer who cannot know a private
actor order receives neither the private event nor a phase/status signal that reveals it.

Player view contains that player's public state, private Role knowledge, faction knowledge, and
private results. Closed-eye view contains only public judge facts. Character name and portrait are
public setup metadata and do not reveal a hidden game Role.

## Delivery model

Every event receives a Match-local monotonic sequence. A player binding stores an acknowledged
cursor. A Prompt delivery contains only visible events after that cursor and records its exact range
before transport. Final response acknowledges the range; invisible sequence numbers may be skipped
without exposing their payloads.

A foundation source history ends at the same sequence as its cursor and renders each visible
bootstrap fact once. Incremental Prompts do not resend the active player's own committed speech,
because it remains in the long-lived Session.

## Parallel barriers

A parallel stage freezes one event sequence before prompting any actor. Every actor's Prompt is
rendered from that sequence. Valid submitted actions stay sealed until all eligible turns settle;
then the Match runtime applies them in deterministic seat order and publishes outcomes.

God view and the submitting player's own view may show the accepted Session as ready while its ACP
turn closes. Other player and closed-eye projections receive no completion-order signal. The barrier
therefore reveals neither another player's choice nor response timing.

Vote and action barriers use the same rule. Vote Prompts are created only after all required prior
speech commits, so every voter receives every other required speech before ballots are accepted.

## Sequential speech and playback

Sequential speech commits each speaker immediately, and the next speaker receives that public
speech once. Agent generation may continue through all speakers in the current stage.

One live spectator connection may own automatic playback. Complete visible sentences enter its
browser queue from stream chunks; the committed event contributes only the remaining tail and the
stable event sequence. The final speech holds the following engine phase until that sequence is
completed, skipped, synthesis fails, or the controller disconnects.

Speech hidden from the controlling projection creates no playback hold. Once the hold releases, a
following vote barrier renders any remaining required speech before accepting ballots.

## Action and speech correction

Schema- and rule-invalid structured actions return a failed tool result inside the active ACP turn.
They change no engine state, phase barrier, or delivery cursor, so the Agent may submit a valid call
in the same turn.

Public speech preserves player-authored text while protecting Match identity references. Fixed judge
facts such as announced deaths, vote results, and phase outcomes remain authoritative; strategic
claims about identity or private information remain player speech.

## Recovery semantics

An uncertain ACP delivery receives one same-Session continuation attempt for the affected player.
Its delivered range advances once, accepted durable actions are reconciled once, and other players
remain untouched. A repeated or failed resume pauses the Match.

The browser preserves its last valid snapshot during transient WebSocket closure, refreshes the
current projection over HTTP, and reconnects with bounded backoff. View switching covers the old
projection before requesting a new one and establishes a new role-effect sequence baseline.

## Terminal synchronization

`match.ended` publishes the winner before final public identity events. For review-enabled Matches,
the first ended live snapshot already contains the server-owned postgame countdown.

Review sheets become public as soon as accepted, while all unfinished rating Prompts retain one
frozen terminal snapshot. A reviewer's first Prompt receives public catch-up after its regular cursor
through the terminal sequence without advancing that cursor; retries receive only continuation.

Reflections use the ordinary public speech stream and final playback boundary. Completed or skipped
review closes the original player Sessions and spectator connection. A deleted or unknown Match
returns 404, clears retained content, and enters a non-retrying unavailable state.
