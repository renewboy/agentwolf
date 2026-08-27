# Assets package

`@agentwolf/assets` owns repository-authored model presentation and reusable browser presentation.

## Responsibilities

- Non-localized Nunjucks Prompt bundles and strict rendering support.
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

## Prompt ownership

`_core` owns shared Session/layout/tool framing. Every installed Rule plugin owns one matching bundle
for its Role, Ability, Phase, event, announcement, and interrupt presentation. Structured or
conditional content is a cohesive template; short labels may be typed manifest fields.

Templates are repository-owned, path-contained, audience-checked, and rendered with undefined values
treated as errors. Model text has no locale axis and does not reuse UI copy.

## Presentation ownership

Visible copy and CSS are centralized here so components contain no raw colors, inline styles, emoji
icons, or unregistered user-facing strings. Role effects consume visibility-safe semantic cues and
contain no game resolution logic.
