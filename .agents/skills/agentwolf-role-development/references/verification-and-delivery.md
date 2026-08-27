# Verification and delivery

Use this reference to plan tests, prove observable behavior, and close the request. New playable
Roles are cross-layer changes; focused unit success alone is insufficient.

## Test matrix

Select every row touched by the Role:

| Surface                         | Required evidence                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Role ability                    | valid and invalid actions, targets, pass, use count, capability authorization          |
| Phase                           | insertion order, activation, actors, action descriptor, sequential/parallel boundary   |
| Settlement                      | lane order, interactions, chained effects, death reactions before victory              |
| Plugin state                    | strict payload, reducer result, event visibility, restore from event log               |
| Query/trigger/interrupt/victory | eligibility, negative cases, deterministic ordering, terminal priority                 |
| Prompt                          | semantic ownership coverage, public/owner text, turn contract, private-fact absence    |
| Projection                      | narration, player IDs, cue mapping, unauthorized-view absence                          |
| Effects                         | catalog or passive coverage, full/reduced/off, once-only playback, cleanup             |
| Catalog/board                   | installed Role list, custom-board validation, built-in composition, immutable snapshot |
| Ruleset                         | new fingerprint, prior snapshot restore, mismatch rejection, shared catalog usage      |
| Strategy                        | Role mapping, index reachability, exact source introduction, local related article     |
| Browser                         | Role count and color, board selection/composition, visible effect and secrecy          |
| Simulation                      | reviewed engine and orchestration replay with stable events and checkpoints            |

Assertions use engine events, DTOs, persisted snapshots, rendered Prompts, projected views, or
browser state. Do not accept an Agent's self-report as evidence.

## Focused commands

Run the narrowest relevant checks while iterating. Typical commands are:

```sh
pnpm exec vitest run --config vitest.config.ts packages/game-engine/tests/plugin-roles.test.ts
pnpm exec vitest run --config vitest.config.ts packages/assets/tests/prompt-bundles.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/context-renderer.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/plugin-projection.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/role-effects.test.ts
pnpm --filter @agentwolf/server typecheck
pnpm --filter @agentwolf/web typecheck
pnpm check:architecture
pnpm check:artifacts
pnpm check:skills
pnpm check:docs
```

Use the exact affected test files if the implementation creates dedicated coverage.

## Cross-layer gates

Before handoff for a shipped Role, run:

```sh
pnpm check
pnpm test:simulation
pnpm simulation:check
pnpm test:e2e
git diff --check
```

If the Role changes approved behavior, create an isolated, uniquely named Match and use the shared
simulation review/approval workflow documented by the repository. Do not hand-author a fixture,
use `replayGame` as an event-generation oracle, overwrite an approved fixture, or mutate a user's
source Match. Review both the fresh engine and production-orchestration replay before approval.

Run live ACP smoke tests only when the change alters player tool contracts, sandbox availability,
or model-facing action execution and credentials are available. A normal Role addition with an
existing action shape usually needs rendered Prompt and fake-session integration evidence instead.

## Documentation and delivery

Update only the owner whose durable contract changed:

- `docs/generated/game-catalog.md` is regenerated from installed Roles and built-in boards;
- `docs/product.md` only when the user workflow or visible behavior contract changes;
- `docs/architecture/game-runtime.md` for shared rule extension contracts;
- `docs/architecture/prompt-and-context.md` for Prompt/context ownership changes;
- `docs/architecture/information-synchronization.md` for visibility, barrier, or delivery changes;
- `docs/architecture/web-client.md` or `docs/frontend.md` for browser architecture or visual principles;
- `docs/testing.md` only when test strategy or fixture policy changes, not when adding coverage;
- the nearest `AGENTS.md` only when durable repository guidance changed.

Describe the implemented current state. Keep design history, migration narrative, future Roles,
and debugging notes out of these documents.

At completion:

1. regenerate the game catalog and verify the closest `AGENTS.md` files remain accurate;
2. when a proposed Agent Note was required, rewrite and move it to `implemented/<class>` with the
   shipped decision, alternatives, consequences, and stable verification contract;
3. report focused and full commands, simulation/browser evidence, and any explicitly unrun checks in
   the request handoff rather than a separate acceptance document.

Do not include `.agentwolf/` databases, sessions, trajectories, generated speech, screenshots, or
credentials in the change.
