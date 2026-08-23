# AgentWolf product

AgentWolf is a local-first spectator platform for multi-agent Werewolf matches. A match assigns one reusable Agent Profile to every seat, creates one long-lived ACP session per player, and lets the rule engine conduct the game.

## V1 game catalog

The role catalog contains Villager, Werewolf, Seer, Witch, Hunter, Idiot, and Guard. The board catalog contains:

- 6-player Quick: two Werewolves, two Villagers, Seer, Hunter.
- 9-player Standard: three Werewolves, three Villagers, Seer, Witch, Hunter.
- 12-player Standard: four Werewolves, four Villagers, Seer, Witch, Hunter, Idiot.
- 12-player Guard: four Werewolves, four Villagers, Seer, Witch, Hunter, Guard.

The 6-player board has no sheriff and uses slaughter-all victory. The 9-player and 12-player
boards use sheriff election and slaughter-edge victory. Custom boards compose the role catalog
for any total from 6 through 24 players. Users configure role counts, sheriff election, and
slaughter-all or slaughter-edge victory, then save, edit, or delete the board. Built-in boards are
read-only and can be copied into a new custom board. Every Match stores its selected board as an
immutable snapshot, so catalog edits do not change existing Matches.

Player identities remain hidden after death and exile. A role-specific public reveal, such as the Idiot surviving exile, remains part of that role's behavior. After the match ends, the server publishes every player's final identity.

## Setup

The Agent settings screen creates, edits, probes, and deletes Agent Profiles. Selecting an Agent Tool opens a temporary ACP session and reads its advertised model configuration; the model is selected from that returned list. A profile combines the tool, selected model, and non-secret connection settings. Environment-variable references supply credentials.

The board-management screen creates and maintains custom boards. The new-match screen selects any
available player count and compatible built-in or custom board, assigns an Agent Profile to each
seat, and edits or rerolls player names. The nickname generator composes curated word lists and
guarantees uniqueness inside a match. Starting a match assigns `player-1` through `player-N` by
seat order.

Every player's initial Match prompt includes one detailed public introduction for each role on the
selected board. Each entry states the role's faction, skill timing, legal targets, usage limits,
key board-policy interactions, and public outcome without revealing which seat owns that role.

Every daytime Prompt begins with the current day and the complete publicly living roster, including
each nickname, seat, and Player ID. During the first-day election, the first campaign speaker is
chosen randomly. A living Sheriff chooses dead-left or dead-right after one night death, and
Sheriff-left or Sheriff-right after a peaceful night or multiple deaths; the Sheriff always speaks
last. Without a Sheriff, the judge uses a replay-stable random direction around a night-death
anchor, or a replay-stable random start and direction after a peaceful night. Multiple deaths use
the lowest-seat death as the no-sheriff anchor.

## Match experience

The spectator screen is a fixed-height live match stage. Player rosters run down the left and right edges, while the center presents streamed speech, public events, night information allowed by the selected view, voting results, and audio playback through the browser Speech Synthesis API. Resolved votes group voter seat numbers under each target seat number. The central history scrolls independently and can be folded by match day.

One connected spectator window can control automatic speech playback. Every player speech visible in that window's selected view enters a sequence-ordered playback queue. Agent speech generation may continue inside the current speech stage, while its final speech holds the following phase until the queue completes or the spectator skips it. Closing the controlling connection releases the hold. Every committed speech also has manual play and stop controls that do not affect match progression.

View projections are server-owned:

- God view includes roles, private actions, and all public events.
- Closed-eye view includes only information publicly announced by the judge.
- Player view includes the selected player's public information, private role knowledge, faction knowledge, and private results.

Role abilities produce view-safe visual effect cues. The match screen plays Werewolf attack and
self-destruct, Seer inspection, Witch antidote and poison, Hunter shot, Idiot reveal, and Guard
protection effects through full, reduced, or off presentation modes. Effects never delay the rule
engine and a projection receives only cues derived from events visible to that view.

Every ACP turn records one normalized trajectory with its exact Prompt, event range, reasoning,
message stream, tool calls, permission decisions, accepted game action, context usage, duration,
session generation, recovery attempt, diagnostics, and result. Capture-time filtering removes
secret-bearing metadata and bounds large fields. Starting with developer mode adds a trajectory
action to every Match record. That action opens the selected Match's loopback-only timeline,
seat-first ledger grouped by shared game periods, detail inspector, and context audit; ordinary
startup exposes none of these routes or controls while continuing to retain the records locally.

## Player identity

Every player has a readable `player-N` ID, a numbered seat, and a nickname. Prompts bind all three. Structured actions use Player IDs. Public speech and last words use nicknames or seat labels.

Speech is checked before it enters the public event log. Known Player IDs are rewritten to nicknames; an unknown `player-N` token rejects the speech and pauses the turn for correction.

Speech and last words come from the ACP response stream and final response, so the live text and
committed text share one source and retain repeated words, punctuation, and whitespace exactly.
Incremental prompts do not send a player its own committed speech back to the same long-lived
Session. The compatibility `submit_speech` tool is unavailable to normal Match turns. Public judge
results remain fixed table facts; players may bluff about identity, private information, and
judgment without rewriting announced deaths, votes, or phase results.

A Witch receives the regular Werewolf attack target only while her antidote remains available.
That target is the only legal antidote target. Once the antidote is unavailable, the Witch receives
no death target information while retaining any remaining poison action.

Werewolves choose the regular night attack through the dedicated wolf vote stage. Their initial
callable ability list contains self-destruct but does not present the regular attack as a
`submit_night_action` ability.

## Match failure behavior

An agent process exit, prompt timeout, malformed structured action, or uncertain prompt delivery activates bounded recovery. One uncertain transport failure per player and phase replaces failed sessions and retries without changing game state. A repeated transport failure or invalid structured action pauses with an operator-visible reason and continue action. Live sessions retain their acknowledged cursors; replacement sessions receive one current foundation plus each player's visible history. Matches can be deleted with their events and delivery ledgers.

An ended Match is a stable record: every identity is visible, every player Session is presented as ended, and the spectator connection settles without reconnecting. A deleted or unknown Match returns a terminal unavailable response rather than entering live recovery.
