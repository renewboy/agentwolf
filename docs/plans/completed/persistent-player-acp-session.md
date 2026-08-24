# Persistent player ACP Session execution plan

## Goal

Guarantee one durable logical ACP Session per Match player from bootstrap through terminal Match
state. Process loss, Prompt timeout, operator continuation, and server restart reconnect that same
Session ID and continue the current game stage without creating another Session or replaying Match
history.

## Completed work

1. SQLite schema seven stores one validated Session binding per Match and Player, including the
   immutable Agent launch snapshot, logical Session ID, bootstrap state, delivery state, and any
   accepted structured action. The binding is reserved before the only `session/new`, activated
   before foundation delivery, and removed through Match-delete cascade.
2. The generic ACP wrapper requires `session.resume` for Match players and supports create and
   resume through the same provider-neutral process, initialization, permission, Prompt,
   cancellation, update-routing, and shutdown implementation.
3. Prompt timeout with a healthy connection continues in place. Agent-process loss starts another
   ACP process and resumes the persisted ID with the current player workspace and AgentWolf MCP
   token. Server restart restores every player through the same binding and ID.
4. Recovery is scoped to the failed player and one automatic attempt per player and phase. Resume
   failure, missing binding, unsupported capability, or ambiguous creation pauses without issuing
   another `session/new`.
5. Every player receives one foundation. An interrupted foundation receives a preparation-stage
   continuation inside the same Session. Later recovery advances the delivered cursor and renders
   only the current judge stage, newly visible events, and exact action or speech contract.
6. The action gateway persists each accepted structured action before returning its receipt.
   Transport or server failure consumes that action without another Prompt or submission, and
   committed actions clear their durable pending state.
7. Trajectory schema and audit record continuation explicitly while retaining one logical Session
   generation. Simulation orchestration, restart reconstruction, parallel barriers, and Prompt
   audits use the production stable-Session path.
8. Architecture gates enforce one generic `session/new` owner, required resume configuration,
   durable binding activation, and the absence of whole-Match replacement paths. Product,
   architecture, synchronization, testing, acceptance, and repository guidance describe the
   implemented Session lifecycle.

## Completion evidence

- `pnpm check` passed architecture, artifact, document, Skill, strict TypeScript, Oxlint, Oxfmt,
  Knip, duplication, 130 unit/integration scenarios across 33 files, coverage, and production build.
- Coverage passed at 88.82% lines, 86.11% statements, 90.94% functions, and 75.13% branches.
- `pnpm test:e2e` passed all 18 Chromium scenarios. `pnpm test:simulation` and
  `pnpm simulation:check` passed the three-fixture, fourteen-variant corpus.
- Real Trae CLI 0.201.5 and Codex ACP 1.6.2 smokes each created one Session, closed the first ACP
  process, resumed the exact same ID in a second process, and submitted another accepted vote.
  Claude Agent ACP 0.70.0 advertised `session.resume` during initialization.
- Focused integration coverage proved same-connection continuation, one-player process recovery,
  failed-resume pause, interrupted-bootstrap continuation, server-restart resume, durable accepted
  actions, one foundation per player, stable Session IDs, and unchanged Session generation.
- The running local workspace migrated its SQLite database to schema seven, exposed the Session
  binding table, and serves the developer UI at `http://127.0.0.1:5173` with the API at port 4310.
  No running or paused user Match was present during migration.
