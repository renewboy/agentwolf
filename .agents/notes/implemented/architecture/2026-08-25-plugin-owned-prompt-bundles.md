# Agent Note: Plugin-owned Prompt bundles

Status: implemented

## Problem

A central Prompt catalog or server dispatch table repeats concrete game IDs outside their RulePlugin,
makes every Role extension a shared edit, and risks mixing private model context into public assets.

## Decision

Every installed RulePlugin has one companion non-localized Nunjucks bundle with the same plugin ID.
The `_core` bundle owns only Session framing, generic layouts, Character framing, references, and tool
contracts. Functional and Role bundles own their complete Role, Ability, Phase, event, announcement,
and interrupt presentation.

The server adapts frozen Ruleset contribution records into a plain assets-owned semantic inventory.
The bundle registry validates exact coverage, ownership, imports, audience direction, path
containment, and event-matcher ambiguity before rendering. `ContextRenderer` passes public and
actor-owned visible facts rather than engine state.

Trajectory stores exact rendered Prompt text. Runtime and fixtures carry no Prompt-version selector.
The current contract is defined in
[Prompt and player context](../../../../docs/architecture/prompt-and-context.md).

## Alternatives considered

**Global Role, phase, and event presentation tables.** They recreate central semantic authority and
require unrelated shared edits for each plugin.

**Localized Prompt dictionaries or one template per sentence.** Model instructions are not UI copy;
fragmentation obscures complete action contracts and conditional context.

**Prompt metadata in engine definitions.** This couples deterministic rules to assets and reverses
the package dependency direction.

**Version-selectable Prompt rendering.** Exact sent text is already durable evidence; runtime
selectors would preserve obsolete presentation branches indefinitely.

## Consequences

New game semantics extend Prompt presentation through the same plugin ownership boundary. Missing,
duplicate, ambiguous, cross-audience, or path-escaping presentation fails before the first render.
Generic runtime code and public templates remain free of concrete private game branches.
