# Assets package

`@agentwolf/assets` owns repository-authored model presentation and reusable browser presentation.

## Responsibilities

- Prompt bundle sources and strict rendering support.
- Player Skill source trees and their build inputs.
- Localized UI copy, narration, Role and Ability labels, and nickname words.
- Built-in Character cards and managed portrait metadata.
- Role-effect presentation catalog, icons, timing metadata, CSS, and design tokens.

Prompt architecture is defined in
[Prompt and player context](../../docs/architecture/prompt-and-context.md). Browser consumption is
defined in [Web client architecture](../../docs/architecture/web-client.md).

## Export boundaries

The main package entry exports browser-safe copy, Character, narration, nickname, plugin-event, and
role-effect assets. Server-only Prompt and player-Skill builders use the explicit `./prompts` and
`./player-skills` subpaths and never enter the Web bundle.

Assets depends on contracts but not on the game engine or server. The server adapts installed
Ruleset semantics into plain asset-owned Prompt inventory and visible facts.
