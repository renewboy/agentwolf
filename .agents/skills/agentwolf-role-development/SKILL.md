---
name: agentwolf-role-development
description: Implement or change a playable AgentWolf game Role across versioned ruleset plugins, Prompts, projections, effects, boards, strategy content, and verification. Use for Role semantics; do not use for Character persona cards.
---

# AgentWolf Role development

Deliver one playable game Role as a cohesive semantic plugin with complete player-facing and
spectator-facing integration. A game Role controls rules, abilities, knowledge, and victory. A
Character card controls public persona and expression; route Character-only work elsewhere.

## Establish the rule contract

Before editing:

1. Read the repository `AGENTS.md` chain, [game runtime](../../../docs/architecture/game-runtime.md),
   and the [adopted rule baseline](../../../docs/reference/game-rules.md). Read only additional module
   documents touched by the Role: Prompt/context, information synchronization, or Web client.
2. Inspect the working tree and preserve unrelated changes. Treat existing Matches and
   `.agentwolf/` runtime data as read-only unless the user explicitly authorizes mutation.
3. Write down the Role's faction and kind; timing; legal actors and targets; pass rules; usage
   limit; visibility of intent, result, and identity; interactions with protection, redirection,
   death, Sheriff, and victory; and whether it enters a built-in board.
4. Ask the user before implementation when any rule variant above is unspecified and different
   choices change observable outcomes. Do not choose a folklore variant silently.
5. Create a proposed Agent Note only when the Role changes a hard-to-reverse architecture, privacy,
   durable-data, or shared extension contract. An ordinary Role addition needs no durable plan file.

Choose existing examples by behavior, not by name:

- `VillagerRole` for a passive Role.
- `SeerRole` or `GuardRole` for a normal night action.
- `MagicMirrorGirlRole` for plugin event state and a private exact result.
- `HunterRole` for a death decision trigger.
- `WhiteWolfKingRole` for a public interrupt, shared faction capabilities, and chained death
  settlement.

## Implement by semantic owner

Read [engine integration](references/engine-integration.md) before changing game behavior. It
routes Role metadata, capabilities, abilities, phases, effects, plugin events, queries, triggers,
interrupts, victory, board composition, and ruleset compatibility.

Read [presentation integration](references/presentation-integration.md) before making the Role
installable or visible. It covers the companion Prompt bundle, visibility-safe narration and
effects, localized UI assets, badge colors, player strategy pages, and built-in boards.

Read [verification and delivery](references/verification-and-delivery.md) before writing tests or
closing the request. Select checks from the Role's actual behavior and run the full cross-layer gates
for a shipped Role.

## Architectural invariants

- Generic kernel, Prompt runtime, and server composition code contain no concrete Role-ID or
  Ability-ID dispatch. Use capabilities, registries, declared phase actions, and plugin-owned
  semantics.
- One Role plugin owns its Role, abilities, Role-specific phases, plugin events, and related
  semantic registrations. Keep the versioned ruleset manifest declarative.
- Validation is pure. Game changes enter as append-only events; durable Role state must reconstruct
  from events and deterministic ruleset configuration.
- Treat a published ruleset ID, version, ordered plugin lock, configuration, and fingerprint as
  immutable. A changed installed manifest becomes a new current ruleset version while previous
  snapshot resolvers remain available.
- Every installed Role has a source-matched public introduction, a mapped player strategy page,
  and either complete effect coverage or an explicit passive-role declaration.

## Completion standard

Finish only when the Role can be selected through the intended board path, completes its legal and
illegal actions through the real action gateway, restores from its event log, exposes no private
facts to unauthorized views, renders its exact Prompt and public presentation, and passes focused,
repository, simulation, and browser acceptance appropriate to its scope.
