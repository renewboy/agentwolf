# Agent Note: Documentation lifecycle and module architecture

Status: implemented

## Problem

Horizontal product, architecture, frontend, synchronization, and testing documents accumulated the
same feature facts. Completed plans retained implementation specifications, and separate acceptance
records repeated their completion evidence. Role work consequently required reading and editing
unrelated documents.

## Decision

The root `AGENTS.md` is a repository map. `docs/architecture.md` is a system map that links one child
architecture document per major cross-package module. Package and app READMEs own local contracts;
product, frontend, testing, rule reference, and generated catalog documents each retain one distinct
job.

Major proposals and decisions use `.agents/notes/<lifecycle>/<class>` and move from proposed to a
present-tense implemented record. Local fixes and ordinary feature work do not require a Note.
Implemented Notes retain decisions and tradeoffs, not plans or dated acceptance output.

Completed plan and per-request acceptance files are absent from the active repository. Git history,
CI, PRs, and request handoffs carry execution evidence. Generated catalog rows come from runtime
owners.

Every `AGENTS.md` is limited to 200 lines. The architecture index and each architecture child are
limited to 400 lines. No word-budget manifest or generalized documentation-size score exists.

## Alternatives considered

**One large architecture document.** It makes every module change touch a shared file and forces
readers to load unrelated design.

**Permanent completed plans plus acceptance records.** They preserve execution history in the active
tree but duplicate current facts, test evidence, and decision rationale.

**A word-budget system for all standing docs.** Word counts do not reflect Chinese/English content
equally and add policy machinery beyond the requested simple line limits.

**No durable decision records.** Git history preserves diffs but does not provide a current,
classified explanation of hard-to-reverse choices and rejected alternatives.

## Consequences

Architecture changes update the index only when module routing changes and otherwise update one
module owner. Routine features primarily change code, tests, assets, and generated reference. The
active documentation tree is smaller, while major reasoning remains discoverable by lifecycle and
class.

## Verification

`pnpm check:docs` validates required owners, local links, parent instruction links, Note structure,
generated catalog freshness, and the 200/400-line limits.
