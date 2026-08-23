# Role-effect animation runtime

## Status

Accepted.

## Decision

AgentWolf uses exactly `gsap@3.15.0` and `@gsap/react@2.1.2` for browser motion. Flip remains the
only registered GSAP plugin beyond the React binding. All imports pass through the browser motion
adapter, and the repository architecture gate rejects version ranges and additional animation
runtimes.

Role effects use semantic cues projected after server visibility filtering. The assets package
owns the effect catalog, IDs, timing tier, duration, and copy. The web effect controller owns DOM
selection and GSAP timelines. Game roles and durable events contain no rendering instructions.

Every effect supplies full and reduced behavior, returns affected elements to rest, remains
pointer-transparent, and never participates in engine timing. A future role must add or explicitly
decline an effect definition together with its visibility, projection, cleanup, and browser tests.

## Consequences

The match stage retains one sequencing and cleanup model for ambient motion, FLIP transitions, and
role effects. The exact dependency versions and single adapter make upgrades deliberate repository
decisions. Presentation can evolve without changing deterministic replay or model context.
