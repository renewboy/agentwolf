# Agent Note: Versioned Ruleset plugin runtime

Status: implemented

## Problem

Concrete Role and phase branches in a shared kernel make every new rule change a central edit,
entangle unrelated Roles, and prevent a historic Match from proving which installed semantics its
snapshot expects.

## Decision

One versioned Ruleset manifest installs an ordered set of RulePlugins. Install scopes record semantic
ownership for Roles, abilities, phases, plugin events, queries, triggers, interrupts, resolution
handlers, and victory evaluators. The generic kernel owns graph execution, validation, event
application, settlement, replay, and bounded continuation without concrete game IDs.

Schema-two board snapshots store the Ruleset ID/version, plugin locks, configurations, hashes, and
canonical fingerprint. Restore requires that exact installed fingerprint. New Matches use the current
Ruleset; historic resolvers remain installed for snapshots that name them.

Shared mechanics are authorized through capabilities. Effects settle through named lanes and plugin
handlers; triggers and interrupts model interactive reactions before terminal evaluation.

The current contract is defined in
[Game runtime architecture](../../../../docs/architecture/game-runtime.md).

## Alternatives considered

**Central Role and phase switches.** This keeps control flow visible in one file but forces every
extension through a shared authority and mixes independent semantics.

**Role objects with Prompt and presentation metadata.** This would reverse package direction and
make the deterministic engine own model/browser concerns.

**Restore against whichever current rules are installed.** This would silently reinterpret historic
events and make replay results dependent on deployment state.

## Consequences

Adding a Role changes its plugin and companion assets rather than the kernel. Plugin registration and
snapshot restore fail closed when ownership, dependencies, graph reachability, or fingerprints do not
match. Published Ruleset versions are immutable compatibility contracts.
