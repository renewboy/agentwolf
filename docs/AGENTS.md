# AgentWolf documentation standard

See [the root AGENTS.md](../AGENTS.md) for repository-wide rules. These instructions apply to
human-facing documentation, package READMEs, Agent Notes, and durable model-facing prose.

## One fact, one owner

Every fact has one authoritative home. Other documents summarize its purpose and link to the owner;
they do not restate its mechanics, edge cases, test inventory, or implementation history.

| Document                 | Owns                                           | Does not own                           |
| ------------------------ | ---------------------------------------------- | -------------------------------------- |
| Root `AGENTS.md`         | standing orders and navigation                 | product or subsystem design            |
| `docs/architecture.md`   | system map and module index                    | module internals                       |
| `docs/architecture/*.md` | one major cross-package module                 | unrelated modules or package APIs      |
| Package/app README       | local contract, failures, limitations          | cross-package design                   |
| `docs/product.md`        | user-observable behavior                       | implementation and test detail         |
| `docs/frontend.md`       | visual and interaction principles              | screen inventory or Web architecture   |
| `docs/testing.md`        | test strategy and fixture policy               | feature-by-feature coverage lists      |
| Generated reference      | exhaustive source-derived catalogs             | hand-authored explanation              |
| Agent Note               | a major proposal or decision and its tradeoffs | execution log or current API reference |
| Code, schemas, tests     | exact behavior and enforceable facts           | duplicated prose catalogs              |

## Current-state prose

- State what the system does now. Keep migration stories, failed attempts, PR narration, and future
  ideas out of current-state documents.
- Match detail to the reader. Product docs describe observable behavior; architecture docs describe
  responsibilities and data flow; package READMEs describe the local consumer contract.
- Preserve non-obvious ownership, timing, failure, privacy, and compatibility guarantees. Delete code
  restatement and test walkthroughs.
- A local fix normally needs code and tests only. Update standing documentation only when its owned
  contract changed.

## Architecture hierarchy

`architecture.md` is a map. It contains the runtime diagram, dependency direction, module index, and
change-routing links only. Each major module has one file under `docs/architecture/`; lower-level
package details live in package or app READMEs.

Every `AGENTS.md` stays at or below 200 lines. `docs/architecture.md` and every file under
`docs/architecture/` stay at or below 400 lines. These are simple readability limits, not content
targets: split by an existing semantic owner rather than compressing unrelated facts together.

## Update routing

- User workflow or visible failure changes: update `product.md` when a reader must act differently.
- Package direction or module responsibility changes: update the architecture index and exactly one
  module architecture document.
- Package-local API, configuration, or failure changes: update that package README or JSDoc.
- Visibility, delivery, barriers, playback, or reconnect changes: update information synchronization.
- Visual language or interaction principle changes: update `frontend.md`; screen details stay in code
  and browser tests.
- Test infrastructure or fixture policy changes: update `testing.md`; adding coverage does not.
- Role or board additions: update source, Prompt/strategy assets, tests, and generated catalog. Update
  architecture only if an extension contract changed.

## Agent Notes

[Agent Notes](../.agents/notes/README.md) use lifecycle and class folders. Only decisions affecting
architecture, durable or wire formats, security/privacy, cross-layer contracts, testing strategy, or
another hard-to-reverse choice require a Note.

An implemented Note records the current decision, genuine alternatives, consequences, and stable
verification contract. It contains no pending checklist, delivery diary, test count, or future plan.

## Validation

- Keep relative links valid and make nested `AGENTS.md` files link to their closest parent.
- Do not hand-edit generated reference files; regenerate them from source.
- Run `pnpm check:docs` and `git diff --check` after documentation changes.
- Run the behavioral checks owned by any visible string, Prompt, command, or interface changed.
