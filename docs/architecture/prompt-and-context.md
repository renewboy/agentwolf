# Prompt and player-context architecture

## Responsibility

This module converts installed game semantics and one player's visibility-safe state into the exact
model Prompt sent through ACP. It owns Prompt bundle loading, semantic presentation coverage,
strict Nunjucks rendering, player Skill delivery, Character framing, and context-budget audit.

Prompt assets live in [`packages/assets`](../../packages/assets/README.md); the server adapts the
resolved Ruleset and Match state into plain assets-owned facts.

## Bundle ownership

Model Prompts use non-localized Nunjucks bundles under `packages/assets/prompts`. `_core` owns Session
framing, generic layouts, Character framing, reference formatting, five in-game MCP tools, and one
postgame-review MCP tool. Functional and Role plugins own their Role, Ability, Phase, event,
announcement, and interrupt presentation.

The server adapts installed Ruleset contribution records into a plain semantic inventory. The assets
loader compares bundle claims with that inventory and freezes one registry before the first render.

## Template forms

Structured content, loops, and conditional branches use cohesive templates. Labels, transitions, tool
titles, and receipts may use typed single-line fields on their semantic owner. Prompt assets contain
no generic string dictionary, locale tree, copy-key lookup service, condition-fragment files,
sentence-level templates, Prompt-version selector, or server branch on concrete Role, Ability, Phase,
or Plugin IDs.

## Fact projection

`ContextRenderer` converts the current Match projection and action expectation into a strict fact
contract containing visibility-filtered events, public state, the current action contract, and the
actor's own state. Template source is repository-owned and path-contained within installed bundles
and declared dependencies. Public templates cannot reference more private assets.

## Prompt flows

A foundation covers its delivery cursor and renders every visible bootstrap fact exactly once:
public board rules, public Role introductions, the acting Role and abilities, private faction
knowledge where applicable, and the acting Character card. It contains no seat-to-Role disclosure.

An incremental turn renders newly visible events after the acknowledged cursor plus one current
stage/action contract. It omits the player's own already-known committed speech while retaining all
other required public speech. A continuation after uncertain delivery is compact and describes the
current action boundary; it does not replay the foundation or full history.

Visible history keeps event order and resolves Player, Role, Ability, Phase, and Faction references
through the frozen registry. Player-authored speech text is preserved rather than reformatted by the
judge presentation layer.

## Player environment

The build copies complete player Skill directories to `.agentwolf/skills`. Each Match workspace links
its `.agents/skills`, `.claude/skills`, and `.trae/skills` directories to that shared output.

The player runtime exposes the player contract, selected Skills, local read/search tools, five
in-game actions, and one postgame-review action. Ambient user memory, unrelated Skills, repository
development instructions, Web access, mutation tools, hooks, plugins, and sub-agents remain absent.

Every bootstrap trajectory audits the complete provider-reported model context against the 12,000
token limit. The exact Prompt sent is stored in trajectory; historical Prompt text is never
re-rendered from current templates.
