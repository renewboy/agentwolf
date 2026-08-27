# AgentWolf product

AgentWolf is a local-first spectator platform for Werewolf matches played by long-lived ACP Agent
sessions. A human configures Agent tools, player Profiles, Characters, and a board, then watches one
server-conducted Match through visibility-safe views.

The source-derived [game catalog](generated/game-catalog.md) lists installed Roles and built-in
boards. This document owns user workflows and observable behavior rather than catalog rows or rule
implementation.

## Setup

The Agent settings screen manages Agent Tools and ordered Agent Profiles. Selecting a Tool opens a
temporary ACP Session to discover advertised models. Selecting a model refreshes its supported
reasoning values. A Profile stores the Tool, model, optional reasoning effort, and non-secret
connection settings; credentials come from named environment variables.

The Collection screen manages public Character cards. Built-in cards are read-only and may be copied
into editable custom cards. A card controls background, personality, public reasoning presentation,
speech style, portrayal boundaries, and portrait. It changes expression only: every Agent retains its
full reasoning quality and strongest game judgment.

Board management combines read-only built-in boards with custom boards for 6–24 players. A custom
board stores Role counts, sheriff and victory policies, plus optional per-seat Agent Profile and
Character defaults. Built-in boards can be copied before editing.

The new-Match flow selects a compatible board and resolves each seat from explicit overrides, board
defaults, then the first ordered Profile. Profiles and Characters may be reused across seats.
Character selection proposes its Character name as the nickname, but nickname remains editable and
must be unique. Starting the Match freezes the board, policies, Profile choices, Character cards,
nicknames, and current global speech-length guidance.

## Player environment

Each seat receives one game-only Agent environment containing its player contract, selected board,
visible Match facts, player Skills, local read/search tools, structured game actions, and postgame
review action. It does not receive unrelated user memory, repository development instructions,
browser/search access, mutation tools, plugins, hooks, or sub-agents.

Every seat creates one logical ACP Session for the Match. Process restarts and transport recovery
resume that same Session ID. The Agent receives incremental visible facts rather than repeated full
history.

## Match experience

The Match screen presents player rails around a central live feed. The feed streams Agent speech,
public events, visibility-permitted night information, vote results, and postgame reflections. Match
history folds by game period and scrolls independently from the fixed stage.

Users can switch between:

- God view, which includes all game Roles and private game actions.
- Closed-eye view, which includes only publicly announced judge facts.
- Player view, which includes one player's public facts, private Role knowledge, team knowledge, and
  private results.

Character name and portrait remain public in every view without revealing a hidden game Role.
Elimination and exile keep ordinary identities hidden during the running Match; Role-specific public
reveals remain part of their rule. Final identity events reveal every seat after the game result.

Structured actions display readiness only in projections allowed to see that player's runtime
status. Parallel votes and actions remain sealed until all eligible players finish, so response order
does not reveal choices. Vote cards group voter seats under each target and preserve abstentions,
weights, and visibility-specific private ballots.

## Speech and effects

Agent speech appears while it streams. The committed event uses the same canonical text, rewrites
known internal Player IDs to public references, and rejects unknown internal IDs for correction.
Players may bluff about identity and private judgment but cannot rewrite fixed judge facts.

One connected spectator can control automatic browser speech playback. Complete streamed sentences
enter the queue immediately; commit adds only the final tail. The last speech in a stage holds the
following phase until playback completes, is skipped, fails, or the controller disconnects. Every
committed speech also supports manual play and stop without affecting progression.

Visibility-safe semantic cues drive Role and sheriff effects in full, reduced, or off mode. Effects
never delay or alter game resolution. Reduced-motion preference selects the reduced presentation.

## Postgame review

After the result and final identity reveal, a ten-second server-owned countdown offers immediate
start or countdown-only skip. Expiry starts review automatically; a started review cannot be skipped.

Every original player Session submits one MVP nominee from the winning players, one SVP nominee from
the remaining players, and five ratings for every other seat. Completed sheets become visible
immediately without entering unfinished reviewers' Prompts. After all sheets arrive, the server
publishes arithmetic averages and deterministic awards.

Players then reflect in seat order through the normal streamed speech bubble and playback path.
Completed or skipped review closes the original Sessions. A repeated review transport failure pauses
with an operator-visible continue action.

## Developer workflows

`pnpm dev:developer` enables loopback-only trajectory and simulation controls while preserving the
same locally captured records as normal mode. A Match record opens its seat-first trajectory,
Player/Record inspectors, and semantic audit issues.

An ended or paused Match may create a sanitized simulation candidate. The browser workflow reviews,
validates, acknowledges warnings, and approves a deterministic fixture; equivalent CLI commands are
available for automation. Capture and approval never mutate the source Match.

## Failure behavior

Schema- or rule-invalid structured actions return an error inside the current Agent turn and permit a
corrected call without changing game state. One uncertain transport failure attempts same-Session
continuation for the affected player only; a repeated or failed resume pauses the Match.

Transient spectator disconnects retain the last valid projection and reconnect with bounded backoff.
A paused Match offers continue, delete, and lobby actions. Deletion removes that Match's durable
records and player workspaces. An unknown or deleted Match settles as unavailable without retrying.
