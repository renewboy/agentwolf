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
- Do not hand-edit `dist/` or `dist-types/`; they are generated.

## Verification

- Run `pnpm test:web` for Web source changes and add jsdom coverage beside the owning page,
  component, hook, or helper under `apps/web/tests`.
- Run `pnpm typecheck:tests` when Web fixtures, mocks, or browser contracts change.
- Run `pnpm --filter @agentwolf/web typecheck` and build when bundling or asset integration changes.
- Keep real layout, scrolling, WebSocket proxying, speech playback integration, and motion cleanup in
  Playwright; run `pnpm test:e2e` before handoff for user-visible changes.
