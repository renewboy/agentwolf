# AgentWolf product

AgentWolf is a local-first spectator platform for multi-agent Werewolf matches. A match assigns one reusable Agent Profile to every seat, creates one long-lived ACP session per player, and lets the rule engine conduct the game.

## V1 game catalog

The role catalog contains Villager, Werewolf, Seer, Witch, Hunter, Idiot, Guard, Magic Mirror
Girl, and White Wolf King. The board catalog contains:

- 6-player Quick: two Werewolves, two Villagers, Seer, Hunter.
- 9-player Standard: three Werewolves, three Villagers, Seer, Witch, Hunter.
- 12-player Standard: four Werewolves, four Villagers, Seer, Witch, Hunter, Idiot.
- 12-player Guard: four Werewolves, four Villagers, Seer, Witch, Hunter, Guard.
- 12-player Magic Mirror: four Werewolves, four Villagers, Magic Mirror Girl, Witch, Hunter, Guard.
- 12-player White Wolf King: three Werewolves, White Wolf King, four Villagers, Seer, Witch,
  Hunter, Guard.

The 6-player board has no sheriff and uses slaughter-all victory. The 9-player and 12-player
boards use sheriff election and slaughter-edge victory. Custom boards compose the role catalog
for any total from 6 through 24 players. Users configure role counts, sheriff election, and
slaughter-all or slaughter-edge victory, then save, edit, or delete the board. Built-in boards are
read-only and can be copied into a new custom board. Every Match stores its selected board as an
immutable snapshot, so catalog edits do not change existing Matches.

Player identities remain hidden after death and exile. A role-specific public reveal, such as the Idiot surviving exile, remains part of that role's behavior. After the match ends, the server publishes every player's final identity.

## Setup

The Agent settings screen creates, edits, probes, deletes, and orders Agent Profiles. Each list row
keeps the profile name and model on separate lines. The whole row is draggable and presents a
following drag image, lifted source state, and insertion marker; its handle also supports keyboard
ordering. The order persists across edits and restarts. Selecting an Agent Tool opens a temporary
ACP session and reads its advertised model configuration; the model is selected from that returned
list. A profile combines the tool, selected model, and non-secret connection settings.
Environment-variable references supply credentials.

The Collection screen contains the Character catalog. Twelve read-only Detective Conan Character
cards ship with generated portraits; each can be copied into an editable custom card. Custom cards
store their background, personality, social posture, public reasoning presentation, speech style,
portrayal boundaries, and a managed local portrait. Character cards affect expression only: every
Agent continues to use its full reasoning ability and strongest available game judgment.

Match player Sessions run in a game-only configuration. Their model context contains the
AgentWolf player contract, the selected board and visible Match history, and the five structured
game actions. A seat with a Character receives only its own immutable card plus an explicit
full-ability boundary; other seats' Character cards are not added to its roster. User memories,
unrelated skills, repository development rules, coding tools,
browser/search tools, plugins, hooks, and sub-agents are excluded.

The global settings screen stores one speech-length preference shared by every Agent. It defaults
to 300 Chinese characters. Match creation copies the current value into the Match setup snapshot,
and each speech Prompt presents it as guidance without truncating or rejecting the final speech.
Changing the global value affects subsequently created Matches only.

The board-management screen creates and maintains custom boards, including one optional default
Character per seat. The new-match screen selects any available player count and compatible built-in
or custom board, inherits those Character defaults, permits per-seat overrides, assigns an Agent
Profile, and edits or rerolls player names. The same Character may appear more than once. Selecting
a Character defaults that seat's nickname to the Character name, but the editable nickname remains
the only Match name; duplicate trimmed nicknames block creation. Every seat initially uses the first
profile in the persisted Agent Profile order. The nickname generator composes curated word lists
and guarantees uniqueness for no-Character seats. Starting a match assigns `player-1` through
`player-N` by seat order and stores the complete selected Character card in the Match setup snapshot.
Board role rows, board compositions, manual identity selectors, and visible Match identities use
the same labeled role colors.

Every player's initial Match prompt includes one detailed public introduction for each role on the
selected board. Each entry states the role's faction, skill timing, legal targets, usage limits,
key board-policy interactions, and public outcome without revealing which seat owns that role.
When a Character is selected, the same foundation distinguishes its fixed Character name from the
player nickname and forbids deliberate mistakes, omitted evidence, or weaker actions for portrayal.
Every daytime Prompt begins with the current day and the complete publicly living roster, including
each nickname, seat, and Player ID. During the first-day election, the first campaign speaker is
chosen randomly. A living Sheriff chooses dead-left or dead-right after one night death, and
Sheriff-left or Sheriff-right after a peaceful night or multiple deaths; the Sheriff always speaks
last. A dead Sheriff transfers or destroys the badge through the Sheriff action tool. Without a
Sheriff, the judge uses a replay-stable random direction around a night-death anchor, or a
replay-stable random start and direction after a peaceful night. Multiple deaths use the
lowest-seat death as the no-sheriff anchor.

## Match experience

The spectator screen is a fixed-height live match stage. Player rosters run down the left and right edges, while the center presents streamed speech, public events, night information allowed by the selected view, voting results, and audio playback through the browser Speech Synthesis API. Resolved votes group voter seat numbers under each target seat number. God view and Werewolf player views also receive the complete private wolf-kill ballot, including no-kill votes and any replay-stable random target selected from a tie. The central history scrolls independently and can be folded by match day.

Every player card shows the model bound to that seat. A visible identity uses one stable role badge:
Villager is silver, Werewolf red, Seer blue, Witch purple, Hunter green, Idiot amber, Guard cyan,
Magic Mirror Girl pink, and White Wolf King white. The badge retains the localized role name so
identity never depends on color alone. Hidden identities use one neutral `身份未公开` badge and
reveal no role color.

One connected spectator window can control automatic speech playback. Complete sentences enter the
browser speech queue while visible Agent text is still streaming; the committed event contributes
only the remaining unterminated tail and is never replayed as a duplicate full speech. Agent speech
generation may continue inside the current speech stage, while its final speech holds the following
phase until the queue completes or the spectator skips it. Closing the controlling connection
releases the hold. Every committed speech also has manual play and stop controls that do not affect
match progression.

View projections are server-owned:

- God view includes roles, private actions, and all public events.
- Closed-eye view includes only information publicly announced by the judge.
- Player view includes the selected player's public information, private role knowledge, faction knowledge, and private results.

Character name and portrait are public setup metadata in every projection. They do not reveal or
replace the hidden Werewolf role.

Role abilities produce view-safe visual effect cues. The match screen plays Werewolf attack and
self-destruct, Seer inspection, Magic Mirror exact-role inspection, Witch antidote and poison,
Hunter shot, Idiot reveal, Guard protection, White Wolf King detonation, Sheriff election, and Sheriff transfer effects through full, reduced, or off
presentation modes. Standing Sheriff candidates carry an explicit raised-hand marker throughout
the election. Effects never delay the rule
engine and a projection receives only cues derived from events visible to that view.

Every ACP turn records one normalized trajectory with its exact Prompt, event range, reasoning,
message stream, tool calls, permission decisions, accepted game action, context usage, duration,
session generation, recovery attempt, diagnostics, and result. Capture-time filtering removes
secret-bearing metadata and bounds large fields. Starting with developer mode adds a trajectory
action to every Match record. That action opens the selected Match's loopback-only timeline,
seat-first ledger grouped by shared game periods, detail inspector, and context audit; ordinary
startup exposes none of these routes or controls while continuing to retain the records locally.
Each player row includes its nickname, configured model, and complete role identity using the same
role badge as the Match screen.

An ended or paused Match can produce a sanitized simulation capture from its immutable board,
fixed roles, player decisions, context ranges, completion order, delivery outcomes, and relevant
speech-playback controls. Developer mode places `添加仿真` on the Match record and opens a guided
workflow for source confirmation, deterministic engine and orchestration review, warning
acknowledgement, approval, and completion. Approved fixtures run offline without model credentials
and compare newly generated game behavior with reviewed event summaries and semantic checkpoints.

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
no death target information. Each Witch turn states antidote and poison status independently and
lists only the potion actions currently legal; if neither potion is usable, the only action is a
pass. Poison guidance is present only while poison remains available.

Werewolves choose the regular night attack through the dedicated wolf vote stage. Each Werewolf
votes for one living non-Werewolf or submits `null` as the explicit no-kill option. No-kill wins
only with strictly more votes than every player target; a highest-vote tie selects one of the tied
player targets by a replay-stable random choice. Their initial callable ability list contains
self-destruct but does not present the regular attack as a `submit_night_action` ability.

Magic Mirror Girl inspects one other living player each night and privately receives that player's
exact role. A player already inspected by the same Magic Mirror Girl cannot be selected again.

White Wolf King participates in the Werewolf council and regular attack ballot. During its allowed
public daytime turn it may self-destruct through its dedicated skill and choose one other living
player; both deaths settle through the common death pipeline. A Hunter taken by this detonation
receives its normal eligible death-skill turn. White Wolf King cannot use the ordinary Werewolf
self-destruct ability.

## Match failure behavior

A schema-invalid or rule-invalid structured action is returned to the Agent as a failed tool result
inside the current turn. The rejected call does not enter the phase barrier or change game state, so
the Agent can submit a corrected action before ending its response.

Every Match seat completes `session/new` once and persists that logical ACP Session ID with its
launch identity, bootstrap state, delivery cursor, and any accepted structured action. A Prompt
timeout with a healthy connection continues inside that Session. Agent-process loss and server
restart initialize another ACP process and call `session/resume` with the persisted ID, current
player workspace, and refreshed AgentWolf MCP authorization. Only the affected player reconnects.

The first uncertain transport failure for one player and phase advances past the delivered
envelope and sends a compact current-stage continuation Prompt. A structured action accepted before
transport loss is consumed from durable state without prompting or submitting it again. A repeated
failure, an unavailable Session binding, an Agent without `session.resume`, or a failed resume
pauses with an operator-visible reason and continue action. Recovery never issues another
`session/new` or sends another foundation. Matches can be deleted with their events, delivery
ledgers, and Session bindings.

Closing a Match or server bounds Session shutdown and reclaims each Agent process tree. On macOS
and Linux, parent-process loss also triggers process-tree termination without waiting for the next
server start.

An ended Match is a stable record: every identity is visible, every player Session is presented as ended, and the spectator connection settles without reconnecting. A deleted or unknown Match returns a terminal unavailable response rather than entering live recovery.
