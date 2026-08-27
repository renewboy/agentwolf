# Game runtime architecture

## Responsibility

The game runtime turns a frozen board and ordered player actions into an append-only deterministic
event stream. It owns Ruleset composition, game state reduction, phase progression, action
validation, effect settlement, interrupts, victory, and replay.

[`packages/game-engine`](../../packages/game-engine/README.md) implements the module. It performs no
filesystem, database, network, process, Prompt, or browser IO.

## Boundaries

- Contracts supplies branded IDs and event/action schemas.
- The server selects a versioned Ruleset, supplies actions, and persists emitted events.
- Assets and the server present already-filtered game semantics; the engine owns no prose or visual
  instructions.
- Roles, faction knowledge, action capabilities, and presentation visibility are separate concepts.

The kernel contains no concrete Role, Ability, Phase, or Plugin IDs. Concrete rules enter only
through installed plugins and validated board configuration.

## Ruleset composition

A `RulesetBuilder` installs an ordered plugin manifest and freezes a `RulesetRuntime`. Install scopes
record which plugin contributes each Role, Ability, Phase, plugin event, query, trigger, interrupt,
resolution handler, and victory evaluator. Duplicate or ownerless registrations fail during build.

The current catalog installs `classic-v3`. Historic `classic-v1` and `classic-v2` runtimes remain
available only for snapshots that name their exact locks. A schema-two Match snapshot stores the
Ruleset ID/version, ordered plugin IDs and versions, configuration hashes, canonical fingerprint,
and resolved board policies. Restore rejects a mismatched installed fingerprint.

## Phase and action flow

Phase plugins contribute function-owned nodes and ordered insertions into a validated graph. Each
interactive node declares:

- action type and actor selection;
- public, actor-private, faction, or god visibility;
- required capabilities or allowed abilities;
- sequential or parallel collection mode;
- trigger and interrupt windows;
- deterministic outgoing edges.

The finalized graph has one entry, unique reachable nodes, valid edge targets, deterministic order,
and bounded continuation. Runtime code asks the active node for actors and expectations rather than
inferring behavior from a phase ID.

The action validator checks actor, phase, target IDs, cardinality, capabilities, Role state, and
single-submission rules before the engine changes. A rejected action produces no event and leaves the
expectation open for correction.

## Settlement

Accepted actions become immutable intents. Effect definitions select a named lane: targeting,
prevention, protection, damage, information, death, reaction, announcement, or victory. The queue
orders effects by lane, definition order, and enqueue sequence.

Handlers may enqueue additional effects. Settlement continues to quiescence under a cycle bound.
Finalizers merge deaths, saves, inspections, durable ability use, and other plugin-owned results.
Interactive death reactions become trigger-selected skill phases before final victory evaluation.

Capabilities authorize both native and dynamically granted abilities. Shared mechanics such as the
regular wolf attack are defined once; Role plugins grant or revoke the capability instead of copying
the mechanic or branching in the kernel.

## Events, visibility, and replay

Every state change is represented by a domain event with a match-local sequence and visibility
descriptor. Reducers reconstruct core and plugin state from the event log. Visibility filtering is
pure and occurs before server serialization or Prompt rendering.

Replay starts from the same frozen board and Ruleset fingerprint, reapplies events in order, and
reaches the same state. Stable Match-derived choices are emitted as events, so later replay never
depends on process randomness.

## Extension contract

A new playable Role contributes its semantics through one Role plugin and companion assets. It may
register capabilities, abilities, phases, event reducers, effects, queries, triggers, interrupts, or
victory behavior. Shared settlement and the kernel do not gain Role-ID branches.

The [Role development Skill](../../.agents/skills/agentwolf-role-development/SKILL.md) owns the
cross-layer implementation workflow. The [game catalog](../generated/game-catalog.md) is generated
from Role-owned manifests and board copy rather than maintained here.
