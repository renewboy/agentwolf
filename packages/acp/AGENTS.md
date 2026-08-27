# ACP package guide

See [the root AGENTS.md](../../AGENTS.md). Read [README.md](README.md) for the package contract and
[ACP Session runtime](../../docs/architecture/acp-session-runtime.md) for Match-level integration.

Keep this package independent of game phases, Roles, Match repositories, and recovery policy.
Provider adapters report protocol/process outcomes; they do not create replacement logical Sessions
or hide transport uncertainty.
