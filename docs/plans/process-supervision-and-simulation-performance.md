# ACP process supervision and simulation performance

## Goal

Guarantee that every ACP process tree is reclaimed after normal shutdown, development restart, or
parent-process failure on macOS and Linux, and remove redundant trajectory reads that make the
approved simulation corpus exceed the default coverage timeout.

## Boundaries

- The process guardian applies to Trae, Codex, Claude, and custom ACP tools without changing ACP
  protocol behavior, tool permissions, or secret handling.
- Game rules, recovery semantics, simulation fixtures, reviewed digests, and public HTTP/WebSocket
  contracts remain unchanged.
- Runtime process tests use isolated fixtures and never kill user-owned processes.

## Work

- [ ] Add a lightweight POSIX guardian and process-group TERM/KILL escalation around every ACP
      launch, including a parent-death control pipe.
- [ ] Bound ACP `session/close`, make server shutdown idempotent across SIGINT/SIGTERM/SIGHUP, and
      terminate development child process groups with a fixed grace period.
- [ ] Cover normal close, hung protocol close, descendant cleanup, parent SIGKILL, and development
      supervisor shutdown with deterministic fixtures; verify one isolated real Trae lifecycle.
- [ ] Skip trajectory delta normalization when a Match has no live trajectory subscribers.
- [ ] Add indexed, parameterized trajectory-record reads by Turn ID and use them for live deltas
      and trajectory pages.
- [ ] Re-run the same 14-variant simulation corpus and CPU profile. Preserve every event,
      checkpoint, audit result, and determinism comparison while reducing the current roughly 85-second
      `simulation:check` runtime by at least half.
- [ ] Make default parallel `pnpm check` pass within the existing 180-second per-test limit without
      a worker override, run browser acceptance, and record current evidence.
