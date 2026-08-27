# Prompt and player-context architecture

## Responsibility

This module converts installed game semantics and one player's visibility-safe state into the exact
model Prompt sent through ACP. It owns Prompt bundle loading, semantic presentation coverage,
strict Nunjucks rendering, player Skill delivery, Character framing, and context-budget audit.

Prompt assets live in [`packages/assets`](../../packages/assets/README.md); the server adapts the
resolved Ruleset and Match state into plain assets-owned facts.

## Boundaries

- The game engine owns rules and visibility, never Prompt paths or prose.
- Assets owns Prompt schemas, templates, labels, rendering, and player Skill sources without
  importing the game engine.
- The server owns Ruleset adaptation and constructs already-filtered facts; generic server code does
  not dispatch on concrete game semantic IDs.
- Prompt runtime is server-only and never enters the Web dependency graph.
- Repository-owned templates are executable presentation assets; user text is never template source.

## Bundle graph

Every installed Rule plugin has one companion directory under `packages/assets/prompts/bundles`
whose basename equals the plugin ID. The `_core` bundle is the only non-plugin bundle.

`_core` owns Session framing, foundation and continuation layouts, generic speech/action layouts,
Character framing, reference helpers, and the in-game and postgame tool declarations. Functional and
Role bundles own their complete Role, Ability, Phase, plugin-event, announcement, and interrupt
presentation.

The loader parses strict manifests, resolves real paths within declared bundle roots, validates
imports and audience direction, compiles templates with `throwOnUndefined`, and freezes one registry
before rendering. It compares bundle claims with Ruleset semantic contributions so every installed
Role, Ability, Phase, and plugin event has exactly one owner and a presentation or explicit omission.

Declarative event matchers use validated scalar fields after visibility filtering. The most specific
matching presentation wins; equal specificity is an error. Matchers contain no regex, callback,
source code, or unrestricted predicate.

## Visible facts

`ContextRenderer` passes only:

- public board and roster facts;
- the acting player's Role, abilities, use counts, and private knowledge;
- the current action descriptor and legal targets;
- the acting seat's immutable Character snapshot;
- events already filtered for that player.

It does not pass `GameState`, pending hidden deaths, secret events, raw plugin state, runtime paths,
credentials, or template source. Public templates cannot import faction-private or actor-private
assets.

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
