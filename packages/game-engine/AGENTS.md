# Game engine package guide

See [the root AGENTS.md](../../AGENTS.md). Read [README.md](README.md) for the package contract and
[Game runtime architecture](../../docs/architecture/game-runtime.md) for cross-package design.

Keep the engine deterministic and IO-free. Extend game behavior through Ruleset plugins,
capabilities, registries, events, and effects rather than concrete Role or Ability branches in the
kernel. Verify rule changes with unit/property tests and deterministic replay.
