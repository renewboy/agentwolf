# Frontend direction

Reading this as: a desktop-first live strategy-game stage for human spectators, with a moonlit tribunal signal language, implemented as a custom React design system.

Design dials: `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 8`, `VISUAL_DENSITY 7`.

The visual reference is [match-stage.png](design/reference/match-stage.png), generated from [match-stage.prompt.md](design/reference/match-stage.prompt.md). Its event-driven behavior is defined in [match-motion.md](design/reference/match-motion.md). The image is a design reference, not a runtime background.

## Visual system

- Base palette: ink navy, graphite, desaturated silver, warm amber, and one deep crimson decision accent.
- Typography: a readable Chinese sans family for controls and transcript, with a restrained Song-style display face for the product title.
- Shape system: 10-12px stage surfaces, compact controls, circular player medallions, and pill geometry only for segmented controls.
- Material comes from layered low-contrast gradients, inset highlights, lunar haze, and static grain. It does not depend on glass panels or neon glows.
- Motion communicates live connection, Agent startup, thinking, streamed speech, phase changes, vote resolution, elimination, recovery, and winner state. Feedback returns to rest after discrete events.
- Continuous waiting feedback uses only transform and opacity. Reduced-motion mode keeps explicit live status copy and removes spatial loops.
- Phosphor is the only icon family.
- Selection controls use the portal-backed `GameSelect` listbox. Destructive actions use the application `ConfirmDialog`; browser-native prompts are not part of the product surface.

## Layouts

- Settings: agent list and focused editor with explicit empty, probe, saving, and error states.
- Board management: built-in and custom board list, role-count steppers, derived 6-24 player total,
  sheriff switch, victory selector, copy, save, edit, and confirmed deletion.
- New match: available-player-count selection, compatible built-in or custom board summary, ordered
  seat assignment, per-seat Agent Profile selector, name edit, per-seat reroll, and reroll-all.
- Spectator: a `100dvh` shell with an integrated status HUD, left and right player rosters, a center presence stage, and an independently scrolling event feed. Speech, system events, night information, votes, and resolutions use distinct presentation. History folds by match day.
- Below 900px, both rosters become one horizontal player HUD above the center stage. The document remains fixed to the viewport.
- Paused match: visible failure reason with continue, delete, and lobby actions. The lobby exposes deletion on every match row.
- Developer: every Match record exposes trajectory and eligible simulation actions in developer
  mode. `添加仿真` opens an application-styled modal for source preparation, live validation,
  warning confirmation, fixture approval, and completion. The dialog traps focus, restores the
  Match-row trigger, blocks dismissal while work is active, and keeps its body independently
  scrollable inside desktop and mobile safe areas. Opening the trajectory action fills the viewport
  below the application bar with a seat-first participant list, a compact
  Prompt/model/tool/runtime record minimap, a virtualized and collapsible Turn ledger, semantic
  event-color tags, full record inspector, live revision updates, older-page loading, search, and
  context-audit status. Minimap nodes select and center their Record. Player switching keeps the
  shell mounted and restores each player's ledger scroll position.

## Live-state rules

- Session status changes push snapshots to the client; the HUD never polls every frame.
- A structured action accepted by the gateway displays as `已提交`. Vote prompts display `投票中`, and the stage displays `等待玩家提交投票` without a rotating presence orb or player ring. The signal rail continues a low-frequency pulse.
- Session bootstrap displays `同步中`. Replacement-session bootstrap displays `正在恢复玩家会话` without exposing hidden actor order.
- God view can show every seat's runtime status. Player view can show the selected player's private status plus public speech. Closed-eye view receives no hidden night actor status.
- Switching views covers the current projection before requesting the next one.
- Reconnecting preserves the last snapshot and displays active connection recovery feedback.
- An ended snapshot closes live reconnection, publishes a settled connection label, exposes final identities, marks every Session as ended, and clears all presence, waveform, and player-ring loops.
- A missing or deleted Match replaces retained content with the unavailable state and performs no further retry.
- Waiting feedback never invents percentages, model reasoning, or completion estimates.
- Role effects use one pointer-transparent overlay and player-card anchors. Full mode adds bounded
  particles and stage-only impact movement; reduced mode keeps a static emblem and target pulse;
  off mode consumes cues without drawing them. The system reduced-motion preference defaults to
  reduced mode.
- Automatic speech playback is owned by one live spectator connection and follows its current server projection. The feed keys playback by committed event sequence, shows only skip on the active automatic item, and disables manual history playback until the automatic queue is idle. Each committed speech otherwise exposes manual play and stop controls. Speech synthesis errors skip the current item and report the outcome without blocking the Match.
- Vote result cards use target-grouped seat labels such as `投1号：2号、3号、4号`; player nicknames are omitted from the result title and ballot rows.

## Frontend gates

Visible copy comes from `packages/assets/copy`. CSS and tokens come from `packages/assets/styles`.
Components contain no inline style props, utility-class design strings, emoji icons, raw color
literals, native select elements, browser prompt calls, or unregistered user-facing text. GSAP
and its React binding enter the browser only through the registered animation adapter. Browser
Speech Synthesis access is centralized in the speech playback hook. Browser tests cover board
management, developer gating, trajectory details, the Match-row simulation wizard, all three view projections, role-effect modes
and cleanup, streaming speech, sequence-keyed automatic and manual audio controls, fixed-height
overflow, waiting-state movement and cleanup, terminal connection settlement, missing-Match retry
shutdown, listbox interaction, confirmation-dialog focus behavior, reduced motion, and responsive
layout.
