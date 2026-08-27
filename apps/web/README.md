# AgentWolf Web client

`@agentwolf/web` is the React/Vite presentation application for setup, settings, lobby, live Match,
postgame review, and loopback developer workflows.

## Responsibilities

- Consume and validate REST/WebSocket DTOs through `src/api.ts`.
- Compose product flows in pages and reusable behavior in components.
- Own browser lifecycles and external effects in hooks.
- Present visibility-safe player state, speech, events, votes, review, trajectory, and simulation.
- Execute semantic role effects and browser speech playback without affecting game timing.

The technical boundary is defined in [Web client architecture](../../docs/architecture/web-client.md)
and the visual contract in [Frontend direction](../../docs/frontend.md).

## Ownership model

- Pages compose routing and product flows.
- Components own reusable interaction and rendering.
- Hooks own WebSocket, speech, motion preference, Profile ordering, and other browser effects.
- `src/motion/gsap.ts` is the only GSAP import boundary.
- `packages/assets` owns copy, CSS, colors, icons, and effect metadata.

Game rules, persistence, Prompt rendering, hidden-field filtering, and Match orchestration remain on
the server. The browser never treats local hiding as authorization.

## Interaction contracts

Selection controls use `GameSelect`; destructive actions use `ConfirmDialog`; shared modal behavior
comes from `ModalDialog`. These owners provide keyboard operation, focus containment/restoration,
Escape behavior, portal placement, and reduced-motion support.

The Match document stays fixed to the viewport while the central feed owns history scrolling.
Transient reconnect retains the last valid snapshot. Ended and unavailable Matches settle according
to server state without unbounded retries.

## Verification

Typecheck and build the app for DTO or asset integration changes. Browser tests own visible flows,
keyboard/focus behavior, responsive layout, live reconnect, playback, and motion cleanup. Keep test
fixtures namespaced and prove teardown removes every created runtime record.
