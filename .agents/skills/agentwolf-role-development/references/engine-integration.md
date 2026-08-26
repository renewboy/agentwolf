# Engine integration

Use this reference for a new Role or any change to Role semantics. Confirm exact paths with `rg`
before editing; the ownership boundaries below are the stable contract.

## 1. Model the Role contract

Use branded IDs from `@agentwolf/contracts`:

- `role-<slug>` for the Role;
- `plugin-role-<slug>` for its Rule plugin and companion Prompt bundle;
- `ability-<slug>-<action>` for submitted abilities;
- `capability-<semantic-action>` for authorization shared across Roles or granted dynamically;
- `phase-<semantic-stage>` for a Role-owned stage;
- `event-<semantic-result>` for Role-owned plugin events;
- `query-...` and `trigger-...` only when the behavior needs those registries.

The current classic ID owners are
`packages/game-engine/src/rulesets/classic/capabilities.ts` and
`packages/game-engine/src/rulesets/classic/plugins/ids.ts`. Keep new constants with their semantic
owner and expose only Role IDs or ability helpers that server code or tests actually consume from
`packages/game-engine/src/index.ts`.

The Role class extends `packages/game-engine/src/roles/base.ts` and declares:

- `id`, `displayNameKey`, `faction`, and `kind`;
- `sharesFactionKnowledge` only when every member of that faction should receive the faction roster;
- static `capabilities`;
- `abilities`, where each ability declares its ID, optional required capability, accepted action
  types, pure validation, resolution effects, and optional event outcomes.

An ability's `validate` function rejects illegal action shape, target, timing, prior use, and board
policy without changing state. Its `effects` function emits semantic resolution effects. Its
`outcomes` function translates the settled result into visible or private domain events. The
engine records `ability.used`; use `abilityUseCount` for usage limits.

Prefer capability checks to Role checks. A shared ability is registered once with
`requiredCapability`; `RoleRegistry` makes it available to every Role or dynamically granted player
that owns that capability. Phase actor selection uses `capability-alive:<id>` and phase activation
uses `capability-active:<id>`.

The player action surface is the closed set in `packages/contracts/src/actions.ts`: speech, vote,
night action, Sheriff action, and skill trigger, exposed through five MCP tools. Use the existing
shape whose semantics match. If none can represent the Role without hiding structure in an
`option` string, treat the work as a protocol change and update contracts, phase action types,
validation, MCP transport, `_core` tool presentation, provider policy, and integration tests
together.

## 2. Register one cohesive Rule plugin

The current classic composition is under
`packages/game-engine/src/rulesets/classic/plugins`. Add the Role plugin ID to the plugin ID owner,
implement the Role in `rulesets/classic/roles`, and export one `RulePlugin<RulesetBuilder>` for the
Role. Wire that plugin into the intended versioned ruleset manifest. Keep Role-specific branches
inside the Role plugin rather than adding a Role-ID switch to kernel or generic orchestration code.

Register only the extension points the Role needs:

| Need                       | Registry or owner                                       | Current examples                          |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Role and abilities         | `roles.register`                                        | every Role plugin                         |
| Own action stage           | `phases.insert` or `phases.register`                    | Seer, Guard, Magic Mirror Girl            |
| Phase completion behavior  | `rules.registerPhaseHandler`                            | Idiot and functional phase plugins        |
| Durable Role event state   | `events.register`                                       | Magic Mirror Girl, White Wolf King        |
| Novel settlement operation | `resolution.registerEffect` and optional finalizer      | synthetic plugin runtime test             |
| Identity or derived result | `queries.register` / `registerModifier`                 | classic identity queries                  |
| Interactive reaction       | `triggers.registerDecision`                             | Hunter                                    |
| Public phase interrupt     | phase interrupt capabilities plus `interrupts.register` | Werewolf, White Wolf King                 |
| Alternate win condition    | `victories.register`                                    | classic victory and synthetic plugin test |

Every plugin config has a strict Zod schema. Declare dependencies by plugin ID and version when the
plugin requires another registered semantic contract. Installation order is deterministic and
semantic ownership is recorded automatically inside the plugin install scope.

### Role-owned phases

A Role-owned interactive `PhaseNode` declares its action type, visibility, capability or ability
requirements, actor selector, activation predicate, and insertion points. The action contract is
authoritative; do not infer behavior from a phase ID. Preserve parallel barrier semantics and use a
sequential stage only when each earlier action must become visible to the next actor.

When a Role can interrupt an existing public phase, add its capability to the owning functional
phase's interrupt window. The functional phase owns when interrupts are legal; the Role plugin owns
the capability and ability. Do not test for the Role ID.

### Effects and settlement

Reuse a registered effect only when its semantics and interaction rules are exact. For novel
behavior, define an `ExtensibleResolutionEffect`, a strict schema, a named lane, and an apply
handler in the Role plugin. Use frame facts and finalizers for aggregate results. Ordering within a
lane uses declared dependencies and stable registration order; cross-lane order follows the fixed
resolution lane sequence. All enqueueing is bounded.

Send deaths through the common damage/death/trigger pipeline when later reactions or victory must
observe them. Test ordering explicitly when the Role can cause multiple deaths, prevention,
redirection, or a death-trigger ability.

### Event-sourced Role state

New Role-specific durable state uses a plugin event with:

- a schema version;
- strict state and data schemas;
- an initial state;
- a deterministic reducer.

Emit the plugin event from the ability outcome or owning phase handler with its exact visibility.
Read the reconstructed state from `GameState.pluginState` for later validation. Do not add new
Role-specific memory mutations to the generic reducer. Add a restore test that rebuilds an engine
from events and proves the state still controls legality.

## 3. Compose boards and rulesets

`BoardCatalogService.listRoles()` discovers installed Roles from the current `RoleRegistry`, so a
new Role automatically becomes available to custom-board composition after installation. A
built-in board still requires:

- a `BoardManifest` composition in `packages/game-engine/src/rulesets/classic/boards.ts`;
- a server built-in board entry and localized name/description;
- exports and catalog tests;
- browser coverage for its composition.

Validate whether the existing `BoardPolicies` can express the Role's configurable rules. A new
policy is a wire and snapshot change: update contracts, manifest construction, Prompt facts,
configuration UI when applicable, restore tests, and current-state documentation together.

### Ruleset compatibility

The ordered installed plugins, their versions and validated configs form the ruleset fingerprint.
Treat that identity as immutable once snapshots may exist.

When installing a new Role plugin or changing plugin version/configuration:

1. preserve factories and exact plugin lists for existing ruleset IDs;
2. create the next current ruleset ID/version with the new manifest;
3. extend the snapshot schema's allowed ruleset IDs;
4. update `apps/server/src/ruleset-catalog.ts` so each snapshot resolves its exact runtime and the
   new ID is used only for newly created Matches;
5. prove old snapshots still restore and mismatched fingerprints still fail closed.

Compatibility rulesets do not acquire the new Role retroactively. Simulation, trajectory audit,
Match restore, Prompt composition, and live runtime must all obtain their runtime from the same
`RulesetCatalog` path.

## 4. Engine verification targets

At minimum cover:

- valid action, every meaningful invalid target/timing/use case, and pass behavior;
- capability authorization and absence from unrelated Roles;
- exact phase insertion and actor selection;
- effect ordering and all interaction policies;
- event payload, visibility, reducer state, and restore;
- trigger/interrupt/victory ordering when present;
- deterministic replay for repeated seed and action sequence.

Use `packages/game-engine/tests/plugin-runtime.test.ts` as proof that extensions need no kernel
edits, and `plugin-roles.test.ts` as the integration style for complex production Roles.
