# Plugin-owned Prompt bundles

## Goal

Make Prompt presentation a plugin-composed subsystem parallel to the Ruleset runtime. Every
installed RulePlugin has one companion Prompt bundle under `packages/assets/prompts`; the generic
loader, registry, renderer, `ContextRenderer`, and shared templates contain no concrete Role,
Ability, Phase, Plugin Event, or announcement IDs.

Adding a Role, Ability, Phase, or plugin event changes only its RulePlugin and companion Prompt
bundle. No central catalog, switch, `if/else` dispatch table, phase list, or Role list is edited.

## Non-negotiable prohibitions

- No file equivalent to `roles/catalog`, `roles/classic`, `phases/classic`, or a global event
  presentation table.
- No concrete `role-*`, `ability-*`, `phase-*`, `plugin-*`, or plugin-event ID literal in generic
  Prompt runtime TypeScript or core templates.
- No one-sentence template and no one-template-per-copy-key migration. Short atomic model text may
  be a string asset attached to its owning semantic declaration, but never a standalone template
  file, generic string dictionary, or global copy key.
- No locale dimension under `packages/assets/prompts`: no `zh-CN`, language code, fallback locale,
  translation lookup, or reuse of UI copy. Prompt strings target the model, not the UI.
- No server-side Role/Phase-specific Prompt assembly.
- No Prompt key or template path in `game-engine` Role, Ability, Phase, event, or action contracts.
- No public template import of wolf-faction private templates.
- No Prompt version, compatibility branch, timestamp switch, content-hash selector, or equivalent
  rendering selector.
- No user-authored template source, unrestricted filesystem lookup, regex matcher, executable
  manifest expression, or silent missing-template fallback.

These constraints are enforced mechanically rather than left to review convention.

## Target runtime

```text
Installed RulePlugins
        |
        v
Ruleset semantic contribution index
        |
        +---- exact plugin IDs and owned Role / Ability / Phase / Plugin Event IDs
        |
        v
Prompt bundle loader ---- packages/assets/prompts/bundles/<pluginId>/bundle.json
        |
        v
Prompt bundle registry ---- ownership, dependency, audience and event-matcher validation
        |
        v
Prompt renderer ---- Nunjucks + visible facts + semantic reference resolvers
        |
        v
ACP delivery and exact stored Prompt
```

`packages/assets` defines and implements the bundle contract without importing `game-engine`.
The server composition root adapts the installed `RulesetRuntime` contribution records into one
plain semantic inventory accepted by the Prompt loader. This preserves the package direction while
keeping all concrete Prompt presentation inside assets.

`packages/assets/prompts/_core` is the only non-RulePlugin bundle. It owns player-session framing,
foundation layout, generic public speech and action layouts, Character framing, history assembly,
Player reference formatting, and the five MCP tool presentations. It owns no concrete game Role,
Ability, Phase, or plugin-event ID.

Prompt assets have two forms:

- typed string fields on the owning bundle declaration for short atomic text such as labels, state
  transitions, status values, tool titles, and receipts;
- Nunjucks templates for structured sections, conditional rendering, loops, and multi-line
  instructions.

Atomic strings and templates share the same non-localized Prompt bundle ownership rules. There is
no string-key lookup service: the renderer receives the string from the already-resolved Role,
Phase, event, announcement, or tool declaration.

## Ruleset semantic ownership

The Ruleset installer records which plugin contributed each semantic object. This is a generic
Ruleset capability, not a Prompt field.

`RulesetRuntime` exposes one immutable contribution record per installed plugin:

- Role IDs registered during that plugin's install scope;
- Ability IDs inherited from those Roles;
- Phase IDs registered during that plugin's install scope;
- Plugin Event `(pluginId, eventType)` pairs;
- Trigger and query IDs when useful for diagnostics.

`installRulePlugins` opens and closes an install scope around `plugin.register()`. Registries record
the active plugin owner without requiring plugin code to pass its own ID into every registration.
Duplicate or out-of-scope registration fails.

The classic phase graph is decomposed by functional ownership:

- the phase infrastructure plugin owns only graph assembly and the entry contract;
- wolf-team, night, Sheriff, death, day, terminal, and Role plugins register their own PhaseNodes
  and edges;
- graph finalization validates one entry, unique nodes, existing edge targets, reachability,
  deterministic ordering, and bounded continuation.

This removes the central phase graph as well as the possibility of recreating a central Prompt
phase catalog. The installed plugin order and resulting game behavior remain deterministic.

## Prompt bundle contract

Every installed RulePlugin has exactly one directory whose basename equals its Plugin ID:

```text
packages/assets/prompts/
  _core/
    bundle.json
    ...cohesive shared templates...
  bundles/
    plugin-classic-wolf-team/
      bundle.json
      ...wolf-team templates...
    plugin-classic-sheriff/
      bundle.json
      ...Sheriff templates...
    plugin-role-witch/
      bundle.json
      ...Witch templates...
    plugin-role-<name>/
      bundle.json
      ...that Role's templates...
```

Plugins with no player-facing presentation still provide an empty strict manifest. This makes
absence explicit without maintaining a central exemption list.

`bundle.json` has one current schema and no version property. Its fields are:

| Field           | Contract                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pluginId`      | Must equal the directory basename and one installed RulePlugin ID.                                                                            |
| `imports`       | Other installed bundle IDs whose public shared templates may be imported. `_core` is implicit.                                                |
| `roles`         | Role metadata owned by this plugin: semantic ID, display label, one cohesive Role template, and owned Ability labels.                         |
| `phases`        | Phase metadata owned by this plugin: semantic ID, display label, audience, typed atomic transition text, and optional complete turn template. |
| `events`        | Declarative visible-event matchers with audience and either atomic `text`, one cohesive template, or explicit `omit`.                         |
| `announcements` | Optional announcement-code metadata owned by this plugin with atomic text or one cohesive event-family template.                              |

The `_core` manifest additionally declares its fixed session layouts and the five MCP tools.
Tool declarations contain atomic titles and cohesive description/receipt templates; they are not a
generic string dictionary and cannot be addressed through free-form copy keys.

Role templates own the complete Role responsibility: public rules, owner-facing state, Ability
presentation, and interrupt wording. They may switch on a small local `section` value, but do not
switch on Role IDs. A Role bundle cannot contain another Role ID. Role and Ability labels are
atomic fields on their owning Role declaration; rules and conditional state presentation remain in
the cohesive Role template.

Phase labels and short state-transition messages are atomic fields on their owning Phase
declaration, not one-line templates or entries in a generic string map. An interactive Phase points
to one complete turn template or to a generic `_core` layout through declared bundle composition.
Phase templates do not compare Phase IDs.

Atomic string fields are deliberately limited:

- one logical line with no block condition, loop, include, import, or macro;
- optional variable interpolation against the same strict facts as templates;
- no name-based lookup and no cross-bundle string reference;
- no language suffix, locale directory, or UI-copy reference;
- no use for complete rules, decision guidance, or multi-step instructions.

## Bundle installation and coverage

For a Ruleset, installation is deterministic:

1. Load `_core`.
2. Walk `RulesetRuntime.plugins` in installed order and resolve the exact companion directory.
3. Parse every manifest with a strict schema and resolve every template through realpath containment.
4. Validate declared imports, dependency cycles, audience direction, and static Nunjucks imports.
5. Register semantic claims and event matchers.
6. Compare claims with the Ruleset semantic contribution index.
7. Freeze the registry before the first render.

The registry requires:

- every installed plugin has one companion bundle;
- every installed Role, Ability, and Phase has exactly one owner and one presentation declaration;
- every registered plugin event has a matching presentation or explicit omission;
- no bundle claims a semantic object owned by another RulePlugin;
- no duplicate phase, Role, Ability, tool, or announcement presentation;
- no template path escapes its bundle or undeclared imported bundle;
- no public entry imports player-private, faction-private, or god-only assets.

There is no Prompt-side global list. Coverage comes from comparing discovered bundle claims with
the live Ruleset registries.

## Declarative event matching

Event presentation uses data matchers declared by bundles. Generic runtime code evaluates matcher
objects and contains no event-type switch.

Matcher rules:

- keys are validated payload property paths;
- values are scalar equality or explicit property-exists checks;
- regex, callbacks, code strings, negation expressions, and arbitrary predicates are forbidden;
- the matcher with the greatest number of satisfied fields is selected;
- two matches with equal specificity are an ambiguity error;
- no match is an error unless an explicit `omit` matcher owns that event;
- matching happens only after engine visibility filtering.

An event presentation may contain atomic transition text or reference a cohesive template for
structured output. One event-family template uses Nunjucks conditions for payload variants such as
potion kind, pass/result state, or target presence. Matchers select semantic ownership and audience;
they do not recreate a prose branch per condition. The registry compiles both forms into the same
render contract, and the generic event renderer does not know which form was selected.

This permits a generic public `speech.committed` presentation and a more specific
`speech.committed + kind=wolf-council` presentation in the wolf-team bundle. The specific
faction-private entry wins without a central switch, and no public template imports the wolf
template. The same mechanism covers wolf ballots, announcement codes, potion events, and plugin
events.

The contracts package exposes the closed core event-type set for coverage. Plugin Event coverage
comes from `RulesetRuntime.events`. Each type or registered plugin event must be rendered or
explicitly omitted.

## Rendering flows

### Foundation

The server provides only the acting Player ID, Role ID, Faction, owned Ability use counts, public
roster, board policies, Character snapshot, and visibility-filtered events. The Prompt runtime:

1. resolves Role and Ability labels from bundle metadata;
2. renders every board Role's public section through its owning Role template;
3. renders the acting Role's owner section through the same bundle;
4. renders visible history through the event registry;
5. composes those results through the `_core` foundation layout.

No server or core template knows a concrete Role ID.

### Turn

The server provides the actor, Phase ID, action descriptor, owned Ability use counts, interrupts,
board policies, public living roster, recent deaths, speech guidance, and visible events. The
Prompt runtime resolves the Phase declaration directly and renders its complete turn template.

Generic vote, public-speech, Sheriff-action, and skill layouts consume the action descriptor rather
than Phase IDs. A plugin supplies a dedicated template only when its interaction needs additional
domain wording.

The Witch bundle receives independent antidote and poison status facts plus the current
action-descriptor constraints. Its Nunjucks template renders each potion independently, includes
the regular attack target only when that fact is visible and the antidote is presently legal,
lists only currently legal choices, and states that `pass` is the sole choice when neither potion
is available. It does not enumerate target, self-save, no-target, potion-availability, or combined
action-state permutations as separate strings or templates. Engine validation remains the
same-turn correction boundary for an invalid tool call, not a substitute for the primary action
contract.

### Visible history

The history assembler preserves event sequence and asks the event registry to render each already
visible event. Templates receive pure reference helpers for Player, Role, Ability, Phase, and
Faction labels. These helpers perform frozen registry lookup and contain no semantic ID branches.

Wolf-council speech and wolf ballots resolve to faction-private templates owned by the wolf-team
bundle. Public history templates cannot import them. Closed-eye and non-Wolf contexts never receive
those events from the engine.

### Session, Character, and tools

The `_core` bundle owns the canonical player contract, bootstrap/turn continuation frames,
Character presentation frame, tool titles/descriptions, and receipts. Provider launch policies
consume the same rendered player contract. The server-only Prompt subpath is absent from the Web
barrel and browser bundle. Tool titles and receipts may be atomic fields on their owning core tool
declarations; tool contracts and instructions remain cohesive templates.

## Typed fact and Nunjucks boundary

`ContextRenderer` constructs one strict assets-owned fact schema from public board data, actor-owned
state, the actor-specific TurnDescriptor, and `visibleEvents()`. It never passes `GameState`, hidden
event collections, raw pending deaths, secrets, runtime paths, or unrestricted plugin state.

The fact and semantic-inventory contracts are assets-owned plain data. `packages/assets` imports
only contracts; it never imports `game-engine`. The server resolves engine objects into those
contracts before rendering.

The Prompt runtime:

- creates one explicit Nunjucks Environment with `throwOnUndefined` and plain-text output;
- uses a custom namespaced loader bound to frozen bundle roots;
- compiles typed atomic string fields as trusted inline Prompt fragments with interpolation only;
- accepts repository-owned templates only;
- exposes only pure, bounded reference-formatting helpers;
- preserves speech text exactly;
- rejects unknown fields, missing references, undeclared imports, and ambiguous event matches;
- never evaluates user input as template source or manifest logic.

## Prompt history and trajectory

Rendering always uses the one installed bundle graph. Prompt version fields and version-conditioned
branches are removed from runtime, trajectory, simulation, tests, and fixtures.

Trajectory retains the exact Prompt sent for every Turn. The database migration removes legacy
Prompt-version properties from stored Turn JSON while leaving every exact Prompt record byte-for-byte
unchanged. Audit checks Prompt cardinality, delivery
ownership, actor/action boundary, sequence range, visible events, foundation coverage,
acknowledgement, continuation, recovery, and bootstrap budget. It does not render current templates
against historical text.

Simulation fixtures retain decisions, actor barriers, delivery outcomes, semantic checkpoints, and
reviewed event digests. Raw Prompt text and Prompt bundle selectors do not enter the corpus.

## Mechanical architecture gates

Add executable checks that fail when:

- generic Prompt runtime or `_core` contains a concrete Role, Ability, Phase, Plugin, or plugin-event
  ID;
- a global Role/Phase/Event catalog or switch is introduced;
- an installed RulePlugin lacks its exact companion bundle;
- a bundle contains an ID not owned by its RulePlugin;
- an installed semantic contribution lacks presentation or explicit omission;
- a template imports an undeclared bundle or crosses to a more private audience;
- a public template contains or imports wolf-private content;
- a bundle uses condition-fragment filenames or copy-key-shaped assets;
- a Prompt directory or manifest introduces a locale/language dimension;
- a generic Prompt string dictionary or name-based string lookup is introduced;
- an atomic string contains block logic, multiple logical lines, a cross-bundle string reference,
  or a UI/localized-copy reference;
- model-only text remains in localized UI copy or server/game-engine source;
- Prompt runtime enters the Web dependency graph;
- Prompt version selectors reappear outside the one-way database cleanup migration.

The key extensibility acceptance is synthetic: a test creates a new RulePlugin with a Role, Ability,
Phase, and Plugin Event plus a temporary companion bundle. Foundation, turn, and event rendering
must succeed without editing any production registry, renderer, core template, catalog, or switch.

## Completed work

- Added plugin install scopes, immutable semantic contribution records, functional PhaseNode
  registration, reachability validation, and a closed core-event inventory.
- Added the strict assets-owned Prompt manifest, namespaced Nunjucks loader, semantic coverage,
  path and audience validation, declarative event matching, ambiguity detection, frozen reference
  resolution, and synthetic extension coverage.
- Added `_core` and exact companion bundles for all 20 installed classic plugins. Role, Ability,
  Phase, announcement, private wolf, Character, player-contract, tool, and receipt presentation is
  owned by those bundles.
- Replaced server Prompt prose and semantic ID dispatch with strict visible facts and bundle
  rendering. Trae, Codex, and Claude consume the same rendered player contract.
- Removed Prompt presentation metadata from game-engine definitions and kept the Nunjucks runtime
  outside the Web dependency graph.
- Removed Prompt-version fields and selectors from contracts, runtime, trajectory, simulation,
  tests, and fixtures. The database cleanup preserves exact Prompt records, and trajectory audit
  validates semantic delivery boundaries.
- Added architecture and artifact gates for bundle ownership, announcements, locale and version
  exclusion, core purity, server-only dependencies, and functional phase ownership. Reviewed the
  player Skill; its gameplay contract remains consistent with the rendered runtime contract.
- Updated the owning product, architecture, synchronization, testing, artifact, repository, and
  server guidance.

## Completion evidence

- `pnpm check` passed all static gates, 40 coverage files, 147 tests, and every package build.
- `pnpm simulation:check` passed all 3 approved fixtures and their engine/orchestration variants
  without changing reviewed semantic event digests.
- `pnpm test:e2e` passed all 18 Chromium scenarios.
- Real isolated Trae CLI 0.201.5 and Codex ACP 1.6.2 `gpt-5.6-luna` smokes each submitted the
  accepted `player-1 -> player-2` wolf-kill vote in one Session and ended normally.
- The production Web bundle contains no Nunjucks or Prompt runtime marker.
- Immutable acceptance evidence is recorded in
  [`docs/acceptance/2026-08-25/04-16-33-plugin-owned-prompt-bundles.md`](../../acceptance/2026-08-25/04-16-33-plugin-owned-prompt-bundles.md).
