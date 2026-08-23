# Agent Profile ordering

## Goal

Make Agent Profile names and models readable in the settings list, let users reorder profiles by
dragging, persist that order, and use its first profile as the default seat assignment when creating
a Match.

## Completed work

- Added an explicit SQLite Agent Profile order, schema-four migration that preserves the current
  visible order, append semantics for new profiles, and position-preserving profile edits.
- Added a validated whole-catalog reorder contract and API that commits every current profile ID in
  one transaction.
- Split Agent Profile rows into a whole-row drag surface, keyboard reorder handle, and selection
  control. Names and models render on separate width-safe lines.
- Added a following drag image, lifted source state, insertion marker, Arrow/Home/End keyboard
  ordering, optimistic feedback, persisted server confirmation, and rollback on failure.
- Kept new-Match setup sourced from the ordered catalog so every seat defaults to its first profile.
- Added repository, migration, HTTP, and Chromium coverage and documented the current behavior.

## Completion evidence

- `pnpm check` passed 92 unit and integration scenarios across 26 files with 88.03% line, 84.99%
  statement, 89.15% function, and 74.71% branch coverage. Architecture, artifact, document, Skill,
  type, lint, format, hygiene, duplication, and production-build gates passed.
- `pnpm test:e2e` passed all 13 Chromium scenarios on isolated ports. The Agent Profile scenario
  started dragging from the row content area, verified lifted-source and insertion feedback,
  completed pointer and keyboard ordering, reloaded the persisted order, and verified 12 reordered
  new-Match defaults.
- The live development page rendered the persisted profiles with separate name/model lines and
  reorder handles. Its 12-seat setup selected the first ordered profile for every seat and emitted
  no browser warning or error.
