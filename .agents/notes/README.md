# Agent Notes

Agent Notes preserve the why, alternatives, and consequences of major AgentWolf decisions. Their
path encodes two axes:

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-<slug>.md
```

## Lifecycle

- `proposed`: reviewed before implementation; may contain plans and acceptance criteria.
- `implemented`: shipped decision written in present tense and kept aligned with current realization.
- `rejected`: considered proposal with a one-line rejection reason in its status.
- `archived`: frozen implemented history that no longer guides ordinary work.

An implemented decision may update factual paths, symbols, defaults, and mechanisms. Reversing the
decision or its rationale requires a new Note that supersedes and links the old one.

## Classes

- `feature`: a major user- or model-facing capability.
- `bug-fix`: a major defect whose prevention requires a durable decision.
- `simplification`: removal of behavior or surface area.
- `architecture`: structure, dependency direction, runtime vocabulary, or cross-package ownership.
- `process`: repository workflow, tooling, or governance.
- `testing`: test architecture or long-lived verification strategy.

## Format

Every Note begins with:

```markdown
# Agent Note: <title>

Status: proposed | implemented | rejected — <reason>
```

A proposed Note contains `Problem`, `Proposal`, `Alternatives considered`, `Acceptance criteria`, and
`Risks`. An implemented Note contains `Problem`, `Decision`, `Alternatives considered`, and
`Consequences`; it may add `Verification` for stable checks and known coverage boundaries.

Implemented Notes never retain `Proposal`, `Plan`, `Migration plan`, `Acceptance criteria`, TODOs,
unchecked checklist items, or dated test totals. Rejected Notes retain the proposal and alternatives
only while their rationale prevents a plausible mistake.

The lifecycle/class directory tree is the inventory. Do not add a generated or hand-maintained
central index.
