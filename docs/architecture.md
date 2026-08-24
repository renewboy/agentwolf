# AgentWolf architecture

## Runtime map

```text
Web spectator and setup UI
          |
          v
Fastify API and view projector ---- SQLite event/profile/board/Character/settings/trajectory repository
          |
          +---- Match orchestrator ---- Action gateway ---- Player MCP tools
          |             |
          |             +---- ACP session supervisor ---- ACP agent processes
          |
          +---- Board catalog ---- immutable Match board snapshots
          +---- Character catalog ---- built-ins / custom cards / managed portraits
          |
          +---- Rule engine ---- role registry / phase graph / resolution agenda
```

## Package direction

```text
contracts  <- game-engine
    ^             ^
    |             |
 assets          acp
    ^             ^
    +------ server ------+
              ^
              |
             web
```

`contracts` owns branded identifiers, API schemas, event envelopes, action schemas, Character schemas, and view DTOs. `game-engine` owns deterministic state transitions and cannot perform IO. `acp` owns process and protocol lifecycle but does not know game rules. `assets` owns prompts, copy, Character cards and portraits, nickname words, design tokens, and CSS. `server` composes the packages, persistence, orchestration, MCP endpoint, REST, managed Character media, and live streams. `web` consumes projected DTOs only.

## Rules and roles

A board manifest selects a phase graph, role IDs, and policy modules. The server Board Catalog
combines read-only built-ins with persisted custom definitions and compiles both into the same
classic manifest. Match creation stores the resolved name, composition, sheriff setting, victory
policy, revision, and ruleset ID as an immutable snapshot; replay and recovery compile that
snapshot rather than consulting the mutable catalog. A role is a concrete class implementing role
metadata and ability definitions. Each ability validates every action form that invokes it and
produces effects for the shared resolution agenda. The grouped Werewolf ballot selects the regular
attack target; the registered Werewolf kill ability validates that target and produces its damage
effect. Immediate abilities such as self-destruct also settle their effects through the agenda
before domain events are appended.

Each interactive phase node declares one discriminated action contract containing its action type,
speech or vote kind, allowed ability IDs or Sheriff actions, event visibility, and permitted
ability interrupts. The engine and server turn descriptor consume that contract directly; phase
IDs identify graph nodes and handler registration only. Rule modules register phase transitions,
resolution handlers, visibility rules, and victory evaluators.

A Character is public presentation metadata and is distinct from a game role. Custom boards store
nullable Character IDs by seat; Match creation resolves board defaults and request overrides into
complete immutable Character snapshots. The Character Catalog combines read-only asset-backed
built-ins with SQLite custom cards. Uploaded portraits are content-addressed under `.agentwolf/`;
historical Match snapshots retain their asset IDs. The game engine and domain event log contain no
Character IDs or card data.

Global Match preferences are persisted separately from Agent Profiles. Match creation reads the
current global settings and stores the speech-character preference in its setup snapshot; runtime
Prompt rendering and trajectory reconstruction both read that immutable per-Match value.

The Agent Profile catalog stores one explicit SQLite order. Reorder requests contain every current
profile ID exactly once and commit in one transaction. Profile edits preserve their position, new
profiles append to the catalog, and the ordered list is the source for new-Match seat defaults.

Submitted actions become immutable intents. The resolution agenda orders effects by named priority and stable sequence:

1. target mapping and redirection;
2. action prevention and ability state;
3. protection, attack, antidote, and poison effects;
4. collision policies;
5. pending deaths;
6. death prevention and replacement;
7. death triggers and chained effects;
8. badge transfer and public announcements;
9. victory evaluation after the agenda reaches quiescence.

Future roles use these extension points:

- Magician registers temporary target mappings.
- Miracle Merchant grants an ability instance with its own usage state.
- Cupid registers a relationship and a chained-death handler plus dynamic allegiance.
- Piper registers status markers and an independent victory evaluator.

## Events, visibility, and synchronization

Every event receives a match-local monotonic sequence and a visibility descriptor: public, god-only, player set, or faction. State is reduced from the event log. View projectors filter before serialization.

Wolf-kill ballots and their grouped resolution use Werewolf-faction visibility, so god and
Werewolf player projections receive the complete vote while other player and closed-eye
projections receive none of it. A no-kill ballot is a real choice and wins only by strict
plurality. A tied highest count selects one replay-stable random player target. The resulting
regular attack selection is visible to living Werewolves and to a living Witch only while her
antidote remains available. The Witch's antidote can target only that regular attack target. Once
the antidote is unavailable, neither incremental events nor the Witch action instruction disclose
a death target to her.

Each player Session binding stores one logical ACP Session ID, immutable Agent launch snapshot,
bootstrap state, delivery cursor, and any accepted structured action. A Match seat completes
`session/new` once. A Prompt envelope contains only visible events after the cursor and is marked
in-flight before `session/prompt`. A final ACP response acknowledges its range. An accepted
structured action is durable before its tool receipt returns and remains authoritative if the final
Prompt response is lost.

The live WebSocket accepts view changes and speech-playback controls as validated client messages.
One connection may own automatic playback for a Match. Visible stream chunks are split at complete
sentence boundaries in the browser, while the committed event supplies the final tail and sequence
identity. The final speech in a sequential speech stage leaves the engine at an explicit action
boundary until that connection reports completion or skip. The playback coordinator is runtime-only
presentation state and uses the committed event sequence as its idempotency key. Hidden events never
create a hold for the controlling view, and owner disconnect releases any pending boundary.

Recovery retains a healthy ACP connection or initializes a new process and calls `session/resume`
with the persisted Session ID, player workspace, and current AgentWolf MCP token. Process lifetime
does not define Session lifetime. The uncertain attempt advances through its delivered sequence;
the same Session then receives only newly visible events and a current-stage continuation contract.
An accepted pending action is consumed without another Prompt. Server restart restores the rule
engine from the event log and resumes every persisted Session ID before incremental delivery.

An uncertain ACP transport failure receives one automatic continuation attempt per player and
phase. Only that player's connection can change. A second failure, missing binding, unsupported
`session.resume`, or resume failure pauses for operator action without creating a Session. The web
client preserves its current snapshot across transient WebSocket closure, refreshes over HTTP, and
reconnects with bounded backoff. Ended snapshots close the live channel and settle locally. Unknown
or deleted Match IDs return 404 and enter a non-retrying unavailable state.

Speech turns deliver preceding visible speech to the active player. Incremental delivery omits the
active player's own previously committed speech because that speech already exists in its
long-lived ACP Session. Vote prompts are created from one barrier snapshot after all speeches are committed, so
every eligible voter receives every other player's speech before any vote is accepted. The same
barrier rule applies to sheriff voting and phase transitions.

Every daytime Prompt renders one current-state line containing the day and the complete publicly
living roster. The current `day.started` event remains acknowledged but is not narrated a second
time in that Prompt. Day speech order is emitted as one `speech.order-set` event containing the
resolved players, anchor basis, anchor player, and direction. Random campaign starts and
no-sheriff directions use a stable hash of Match ID, day, and the relevant player sets; the event
log therefore replays the chosen order without runtime randomness.

The complete phase matrix is defined in [Information synchronization](information-sync.md).

## Developer trajectory

The server records trajectory Turn and Record entities independently from the game event log. A
Turn begins at the delivery attempt and owns its Player, durable ACP Session generation, phase, action
type, acknowledged event range, attempt number, timing, final status, and context usage. Stable
records inside it represent Prompt, reasoning, message, tool, permission, accepted action, usage,
diagnostic, lifecycle, and error data. Stream records merge by message channel and ID; tool state
merges by tool-call ID. Text chunks append in protocol order without content-based deduplication.
For a speech Turn, the same speech normalization used by the engine provides the canonical text
projected for its final message Record, including when older captured stream text was incomplete.

Secret-key fields, HTTP credentials, ACP metadata, and environment material are removed before
SQLite receives a record. Content fields retain an explicit truncation marker. A monotonic
trajectory revision supports catch-up and live WebSocket upserts. The audit service reconstructs
the engine at every Turn's `toSequence`, renders the expected foundation or incremental Prompt,
and compares it with the persisted Prompt while checking delivery ownership, ranges, and final
acknowledgement.

The developer ledger derives `开局`, `第 N 夜`, `上警`, `第 N 天`, and `对局结束` from
the game event sequence at each delivery boundary. These shared periods group every player's
records; player-local delivery ordinals remain diagnostic metadata rather than timeline headings.

Trajectory collection is always active. Developer HTTP, WebSocket, configuration, and per-Match
record actions require startup developer mode, which is valid only on a loopback listener. The Web
route carries one Match ID and does not provide a cross-Match selector.

Trajectory persistence skips live-delta projection when a Match has no trajectory subscriber.
When a subscriber exists, delta normalization and paged reads load only the referenced Turn
records through the indexed Match-and-Turn lookup.

## Deterministic simulation

Simulation capture reads the immutable Match board, per-Match speech character limit, append-only
event log, normalized player Turns, accepted actions, and minimal playback-control records. Its
replay payload replaces Match, Profile, board, Session, delivery, name, time, and path identifiers;
local candidate provenance retains only the source Match ID and capture time. Schema-one payloads
default an omitted speech character limit to 300. Raw Prompts, reasoning, tool output, credentials,
diagnostics, and runtime paths do not enter simulation fixtures.

Candidate captures retain their complete canonical event trace for local review and live under
`.agentwolf/simulations/inbox`. Approval writes a versioned fixture under the server test corpus
with player decisions, structural context metadata, reviewed event count, event-type order,
semantic digest, and terminal checkpoint. The original Match is never changed by capture.

The simulation workflow service owns candidate loading, schema-one normalization, repeated engine
and orchestration review, runner agreement, warning and secret gates, compact fixture creation, and
non-overwriting approval. CLI commands and loopback developer HTTP routes call this same service.
The browser receives summary counts, check states, diagnostics, and repository-relative paths; it
does not receive unrestricted path input or full runner output.

Sequential replay asks the current engine for the active player and supplies that player's recorded
action; reviewed event order and digest remain the truth for sequence behavior. Parallel replay
requires the complete recorded actor barrier and validates it against production orchestration.

The engine runner creates a fresh rule engine with fixed roles and resubmits the captured decisions.
The orchestration runner uses in-memory persistence and deterministic fake Player Sessions through
the production Match runtime and Action Mailbox. Both runners validate event invariants and the
reviewed expectation; the orchestration runner also reconstructs every Prompt, checks delivery
acknowledgements and parallel barriers, and exercises bounded delivery recovery and playback
outcomes. A stable fixture-and-variant seed identifies every run.

## Role-effect projection

Domain events contain game semantics only. After visibility filtering, the server projects
recognized role and Sheriff events into `RoleEffectCue` DTOs. The browser consumes each sequence once through
the role-effect catalog and GSAP adapter. A view change establishes a new sequence baseline, so a
newly selected projection cannot replay historical private cues. The effect overlay is
pointer-transparent and cannot alter rule timing or state.

## ACP and action transport

An Agent Tool is a command, arguments, environment allowlist, initial mode, and capability hints.
The settings API discovers its current models and modes from the ACP `session/new` response before
an Agent Profile binds the tool to one advertised model and its connection options. The profile
catalog API returns profiles in their persisted order and accepts validated whole-catalog reorder
requests.

For each seat, the supervisor reserves a durable binding, starts a stdio ACP process, initializes
the connection, requires the stable `session.resume` capability, and creates one Session with the
seat workspace and AgentWolf MCP server. It persists the returned ID before the single foundation
Prompt. Later processes call `session/resume` with that ID and replace the Session's MCP connection
configuration with the current player-bound endpoint and token. ACP permission requests are
approved only when their structured MCP server and tool identity matches one of the five AgentWolf
action tools. `session/update` is the streaming source; the final `session/prompt` response closes
the turn.

On macOS and Linux, every ACP command runs inside a lightweight guardian-owned process group. The
guardian relays stdio without interpreting ACP data, observes the AgentWolf parent through a
dedicated input relay, and terminates the complete Agent process tree when that parent closes or
dies. Normal Session shutdown bounds the protocol close request, then escalates the process group
from TERM to KILL. Development server and Web process groups use the same bounded escalation.

Every built-in player process uses a provider-specific game-only launch policy. Trae receives
per-process config overrides plus ACP tool allow/deny flags after the `acp serve` subcommand. Codex
receives an isolated `CODEX_CONFIG`. Claude receives session metadata with an empty built-in tool
set and no ambient setting sources. These policies remove user memories, global skill catalogs,
plugins, hooks, repository development instructions, shell/file/browser/search tools, and
sub-agents. The AgentWolf player contract is the model instruction source, and the only external
tools are the five actions on `agentwolf-player-actions`.

Trae explicitly enables its code-mode host as the dispatch surface for those allowlisted MCP
actions. Its `tools.enabled_tools` catalog still contains only the five AgentWolf functions;
`shell_tool`, `unified_exec`, file tools, browser/search, plugins, hooks, and Agent features remain
disabled. The host therefore supplies MCP call transport without restoring a coding environment.

Prompt contract 16 audits a 12,000-token bootstrap context budget. The budget includes the Agent
runtime's model instructions and tool schemas as reported by ACP usage, not only the visible judge
Prompt.

The MCP server is bound to one player token. It exposes speech, vote, night action, sheriff action,
and skill trigger tools. Normal Match speech is committed from the ACP response; `submit_speech`
is a compatibility surface that requires an explicit expectation opt-in which the Match runtime
does not grant. Before acceptance, the action gateway validates actor, phase, ability, target Player
IDs, cardinality, role state, and single-submission rules without changing engine state. A rejected
call returns its reason as a failed tool result inside the same Agent turn and leaves the expectation
open for a corrected call. Werewolf self-destruct is offered only during the sheriff election and
daytime speech or vote phases declared by the phase graph. Wolf council accepts natural discussion only and
opens its structured `submit_vote` attack action in the following phase. The regular attack is not
advertised as a callable night-action ability, and that vote phase explicitly rejects
`submit_night_action`. Acceptance stores the action inside the current phase barrier and broadcasts
a private submitted Session status. The engine appends
immutable action events in seat order after every eligible ACP turn settles.
