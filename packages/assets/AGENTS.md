# Assets package guide

See [the root AGENTS.md](../../AGENTS.md). Read [README.md](README.md) for package ownership, plus
[Prompt and player context](../../docs/architecture/prompt-and-context.md) or
[Web client architecture](../../docs/architecture/web-client.md) for the affected surface.

Keep model Prompt assets non-localized and plugin-owned. Keep browser-safe exports separate from
server-only Prompt and player-Skill entrypoints. UI copy, CSS, colors, icons, and motion metadata stay
asset-owned.
