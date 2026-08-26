# Presentation integration

Use this reference once the Role is installed or any Role-visible fact changes. Prompt text,
localized product copy, player strategy, and spectator effects have distinct owners.

## 1. Companion model Prompt bundle

Create `packages/assets/prompts/bundles/plugin-role-<slug>/`. Its basename and `bundle.json`
`pluginId` exactly match the installed Rule plugin ID. The live ruleset semantic contribution index
must match the bundle's Role, Ability, Phase, and plugin-event claims exactly.

The bundle contains:

- one Role declaration with an atomic label, complete `role.njk`, and every owned ability;
- every Role-owned phase, with audience, daytime flag, and one complete turn template for each
  interactive phase;
- every Role-owned plugin event, matched declaratively by `pluginId` and `eventType`, including an
  explicit `omit` when the event itself should not add model narration;
- owned public announcements when the Role emits announcement codes;
- an interrupt template for every ability offered during another phase.

`role.njk` has readable `public` and `owner` branches. The public branch defines current rules and
includes the exact source `角色介绍` from the mapped strategy Role page. The owner branch states
identity, faction, abilities, and formal ability IDs needed for structured actions.

Prompt assets are non-localized Nunjucks. Keep labels and one-line transitions as typed atomic
manifest fields; use cohesive templates for conditions, loops, and multi-line instructions. Do not
create locale folders, a global string dictionary, condition-fragment files, Prompt versions,
server-side Role dispatch, or a bundle that owns another plugin's semantic ID.

`ContextRenderer` provides only visibility-filtered events, public roster/board state, the actor's
Role and ability-use counts, and the current action contract. If a template needs a private fact,
emit a private event or add a narrowly typed, visibility-safe fact contract; never pass raw
`GameState`, pending hidden deaths, unrestricted plugin state, or template paths. Give the model
compact current facts and legal choices, leaving strategic judgment to the model.

Add or extend Prompt bundle and `ContextRenderer` tests for public foundation text, owner text,
current turn instructions, legal choices, event rendering, and absence of hidden facts.

## 2. Player strategy coverage

Every installed Role maps to one page under
`packages/assets/player-skills/werewolf-strategy/references/roles`. The page must be reachable from
the Role index and contain `技能介绍`, `角色介绍`, and `相关阅读`, including a local article link.
Add the Role-ID-to-page mapping in `scripts/harness/check-skills.ts`.

The public Prompt Role template must contain the page's `角色介绍` section verbatim. Do not invent
or summarize the source introduction. If no suitable source page or alias exists, stop and ask the
user which authoritative material to use. Do not run the catalog refresh merely to add one Role;
it synchronizes the complete source catalog.

Player-only Skills remain under `packages/assets/player-skills` and are copied to
`.agentwolf/skills`. The project coding Skill under `.agents/skills` is not copied into player
workspaces.

## 3. Localized product and board presentation

Add localized user-facing values to `packages/assets/copy/zh-CN.json`:

- Role display key referenced by `Role.displayNameKey`;
- ability, phase, narration/timeline, and effect labels actually shown;
- built-in board name and description when applicable.

Do not place model Prompt text in localized UI copy.

Custom board management discovers the installed Role automatically. A built-in board also needs an
explicit server catalog entry. Update API/integration and browser expectations that enumerate
built-in boards or installed Role counts.

## 4. Visibility-safe narration and effects

For a new plugin event, add one typed presentation in `packages/assets/src/plugin-events.ts` that:

- parses event data at the presentation boundary;
- returns only relevant player IDs;
- produces localized narration or timeline text;
- maps the already-visible event to an optional semantic effect cue.

The event's engine visibility remains the security boundary. Server projection filters events
before narration and cue derivation. Test god, closed-eye, owning-player, faction, and unrelated
player views as applicable; absence assertions are required for private results.

Register active feedback in `packages/assets/src/role-effects.ts` with Role ID, Ability ID when
applicable, localized label, bounded duration, tier, and semantic icon. Reuse the generic Web
controller unless a genuinely new visual primitive is needed. If adding an icon primitive, extend
the centralized Phosphor icon mapping; do not add emoji, raw colors, inline styles, or a Role-event
switch in React.

Every installed Role must satisfy one of these paths:

- every active ability has a role-effect definition, and the Role has at least one definition; or
- the Role has no active visual event and is added to the explicit `passiveRoleIds` exception.

The Web controller provides full, reduced, and off modes. Acceptance must prove a newly visible cue
plays at most once, private cues remain absent, projection switches do not replay history, and all
card/stage transforms are cleaned up.

## 5. Role badge and visual identity

Give each installed Role a labeled semantic color that is consistent across board management,
Match setup, spectator cards, and trajectory views:

1. add full and soft tokens in `packages/assets/styles/tokens.css`;
2. map the Role ID in `packages/assets/styles/components.css`;
3. keep hidden identities on the neutral `hidden` badge;
4. update Playwright palette/count assertions and specific color checks.

Add effect-specific CSS in `packages/assets/styles/screens.css` only when the catalog's default
effect signal is insufficient. All visual changes follow `docs/frontend.md` and use asset-owned
tokens.
