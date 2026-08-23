# Browser simulation workflow

## Goal

Move simulation creation into each eligible Match record and provide a complete, accessible browser
workflow for capture, deterministic review, warning confirmation, and fixture approval.

## Completed work

- Added shared review and approval services used by both CLI and developer HTTP routes, with stable
  result contracts, schema-one normalization, runner agreement, secret and warning gates, compact
  oracle generation, and non-overwriting writes.
- Added `添加仿真` beside the existing Match actions for ended and paused records, with an explanatory
  disabled state for ineligible Matches. Removed all simulation controls from the trajectory page.
- Added a guided modal for preparation, live review, diagnostics, warning acknowledgement, current
  behavior confirmation, approval, existing-fixture handling, and completion.
- Extracted the reusable modal layer so confirmation and workflow dialogs share backdrop behavior,
  Escape handling, focus trapping, focus restoration, and busy-state dismissal rules.
- Added desktop, mobile, keyboard, warning, API, repeated-approval, source-preservation, and full
  browser coverage, plus current-state product, architecture, frontend, testing, and operations
  documentation.

## Completion evidence

- `pnpm check` passed 79 tests across 26 files, strict TypeScript, lint, formatting, hygiene,
  zero-clone duplication, architecture, artifact, documentation, Skill, coverage, and production
  build gates.
- Coverage reached 87.81% lines, 84.68% statements, 88.96% functions, and 73.73% branches.
- `pnpm test:e2e` passed all twelve Chromium scenarios, including the Match-row wizard, warning
  acknowledgement, approval, focus restoration, and 390×844 viewport containment.
- The in-app browser showed no warning or error logs. The mobile dialog stayed within `x=8`, `y=8`,
  `374×828` bounds in a 390×844 viewport with no document-width overflow.
- `pnpm simulation:check` passed three approved fixtures and fourteen variants. The existing
  `simulation-ended-6feafc84a08f2b49` candidate also passed shared CLI review with both runners,
  determinism, runner agreement, warning, and secret checks.
