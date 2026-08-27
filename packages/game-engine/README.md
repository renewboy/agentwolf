# Game engine package

`@agentwolf/game-engine` is AgentWolf's deterministic, IO-free Werewolf runtime. It reduces an
append-only event stream, validates actions, advances a plugin-composed phase graph, settles effects,
and evaluates victory.

## Responsibilities

- Versioned Ruleset and RulePlugin installation.
- Role, Ability, capability, phase, query, trigger, interrupt, event, resolution, and victory
  registries.
- Built-in and custom board manifests.
- Pure action validation, state reduction, visibility filtering, speech normalization, and replay.
- Deterministic vote resolution, speech order, effect settlement, and terminal evaluation.

The full cross-package model is in [Game runtime architecture](../../docs/architecture/game-runtime.md).

## Boundaries

The package depends only on contracts and Zod. It performs no filesystem, database, network,
subprocess, Prompt, localization, or browser work. It does not know Agent Profiles, Character cards,
ACP Sessions, Match repositories, or visual effects.

The generic kernel contains no concrete Role or Ability IDs. Ruleset plugins own concrete semantics;
capabilities connect shared mechanics to eligible Roles.

## Extension points

A RulePlugin registers semantics through `RulesetBuilder` under an install scope. Registration records
the plugin owner and fails on duplicates. New Roles use those registries rather than modifying central
kernel switches.

Boards select a frozen phase graph and policies. Published schema-two snapshots bind one exact
Ruleset lock and fingerprint; incompatible installed semantics fail restore.

## Verification

Use package unit and property tests for rules, state reduction, visibility, settlement, and replay.
Cross-layer Prompt, Session, persistence, and browser behavior belongs to server/assets integration or
E2E tests rather than this package.
