# AgentWolf Web guide

See [the root AGENTS.md](../../AGENTS.md) for repository-wide conventions. These instructions apply
to `apps/web`; [README.md](README.md) owns the package-local contract.

Read [Web client architecture](../../docs/architecture/web-client.md) for browser ownership and live
state, [information synchronization](../../docs/architecture/information-synchronization.md) for
projection/reconnect/playback semantics, and [frontend direction](../../docs/frontend.md) for visual
or interaction changes.

## Boundaries

- Consume validated REST and WebSocket DTOs through `src/api.ts`; game rules, persistence,
  hidden-field filtering, and server orchestration never move into the browser.
- Keep page composition in pages, reusable interaction in components, browser effects in hooks, and
  all GSAP imports behind `src/motion/gsap.ts`.
- Use asset-owned copy, CSS, colors, motion values, and design tokens. Components contain no inline
  style props, raw colors, emoji icons, utility-class design strings, or unregistered visible text.
- Use `GameSelect` for selection and `ConfirmDialog` for destructive confirmation. Do not use native
  selects or browser prompt APIs.
- Do not hand-edit `dist/` or `dist-types/`; they are generated.

## Verification

- Run `pnpm --filter @agentwolf/web typecheck` and build when bundling or asset integration changes.
- Add browser coverage for visible flows, keyboard/focus behavior, responsive containment, reconnect,
  playback, and motion cleanup; run `pnpm test:e2e` before handoff for user-visible changes.
