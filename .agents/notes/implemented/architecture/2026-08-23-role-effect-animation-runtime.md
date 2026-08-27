# Agent Note: Role-effect animation runtime

Status: implemented

## Problem

Role actions need expressive browser feedback without coupling deterministic events to DOM details,
delaying game progression, or allowing several animation runtimes to establish incompatible timing
and cleanup models.

## Decision

AgentWolf pins `gsap@3.15.0` and `@gsap/react@2.1.2`. All GSAP imports pass through the Web motion
adapter; Flip is the only additional registered plugin.

Domain events contain game semantics only. After server visibility filtering, presentation registries
project semantic `RoleEffectCue` values. Assets owns effect metadata and timing; the Web effect
controller owns DOM selection and timelines. Full, reduced, and off modes consume each cue once,
remain pointer-transparent, return elements to rest, and never participate in engine timing.

The current design is documented in [Web client architecture](../../../../docs/architecture/web-client.md)
and [Frontend direction](../../../../docs/frontend.md).

## Alternatives considered

**Rendering instructions in game events.** This would make replay and game semantics depend on a
specific UI runtime and expose presentation fields across projections.

**Multiple animation libraries.** Independent runtimes would duplicate sequencing, reduced-motion,
cleanup, and test behavior while increasing bundle and ownership ambiguity.

**CSS-only effects.** CSS remains appropriate for ambient states, but Role sequences need explicit,
seekable cleanup and bounded composition under one runtime owner.

## Consequences

Role effects can evolve independently from rules and replay. New active effects require semantic cue,
visibility, asset definition, full/reduced behavior, cleanup, and browser coverage; passive Roles
declare their lack of an active effect explicitly.
