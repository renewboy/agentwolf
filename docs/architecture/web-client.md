# Web client architecture

## Responsibility

The Web client presents setup catalogs, Match state, postgame review, and developer diagnostics from
validated REST and WebSocket DTOs. It owns browser lifecycle, interaction, local presentation state,
speech playback, and semantic effect execution.

[`apps/web`](../../apps/web/README.md) implements the module. Product rules, persistence, hidden-field
filtering, and server orchestration never move into the browser.

## Boundaries

- `src/api.ts` validates every server response and client message through contracts schemas.
- Pages compose product flows; reusable components own interaction and presentation; hooks own
  browser effects and external lifecycles.
- The browser trusts the selected projection because the server removed unauthorized fields before
  serialization; local hiding is never a secrecy mechanism.

## Live state

`useLiveMatch` retains the last valid snapshot across transient WebSocket closure, refreshes over
HTTP, and reconnects with bounded backoff. A view change covers the current projection before
requesting another and establishes a new role-effect baseline.

Unknown or deleted Matches settle on HTTP 404 without another reconnect loop. An ended Match remains
live while postgame review is counting down, collecting sheets, reflecting, or paused. Completed and
skipped review settle locally and close continuous presence state.

Session status and speech chunks arrive as server events; components do not poll model progress.
Waiting UI may communicate liveness but never invent percentages, reasoning text, or completion
estimates.

## Presentation ownership

The Match page uses a fixed `100dvh` shell. Player rails present public setup metadata and
visibility-safe Role state; the center feed owns independent history scrolling, live speech, public
events, votes, and postgame reflections.

The [Web package contract](../../apps/web/README.md) owns shared interaction implementations.

The [frontend direction](../frontend.md) owns visual language, responsive layout principles, and
motion taste. Exact screen behavior remains in components and browser tests rather than this
architecture document.

## Role effects

Role effects consume semantic `RoleEffectCue` values projected by the server after visibility
filtering. Domain events contain no animation name, duration, color, or DOM instruction. The assets
package owns effect definitions, copy, visual tokens, and duration tiers; the Web controller executes
them through the pinned GSAP adapter in full, reduced, or off mode.

A new active Role effect includes the semantic event, visibility, cue mapping, full/reduced behavior,
cleanup, and browser verification. A Role without an active visual event is registered as an explicit
passive exception. Repository checks enforce the pinned animation dependencies, single runtime import
boundary, and Role coverage.

## Speech playback

One live connection may own automatic playback. `useSpeechPlayback` is the only browser Speech
Synthesis owner. Complete streamed sentences enter the queue immediately; the committed event
flushes only the final tail and supplies the sequence used for completion.

Manual play and stop operate on committed speech without changing Match progression. Skip,
synthesis failure, and controller disconnect report a playback outcome so the server can release a
held phase boundary.

## Developer UI

Developer startup exposes per-Match trajectory and simulation actions. The trajectory screen keeps
participant selection, shared-period timeline, minimap navigation, player diagnostics, Record detail,
and audit issues in one Match-scoped view. The simulation wizard calls the server workflow and never
accepts arbitrary filesystem paths.
