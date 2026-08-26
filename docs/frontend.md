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
- Visible identities use one labeled role badge system across board management, Match setup,
  spectator, and developer surfaces: silver Villager, red Werewolf, blue Seer, purple Witch, green
  Hunter, amber Idiot, cyan Guard, pink Magic Mirror Girl, and white White Wolf King. Hidden identities use a neutral badge with no role-specific
  color. Awakened Hidden Wolf uses a copper label distinct from Werewolf and Magic Mirror Girl.

## Layouts

- Agent settings: ordered agent list with separate name and model lines, whole-row drag images,
  lifted source and insertion feedback, keyboard reorder handles, and a focused editor with
  explicit empty, probe, saving, and error states.
- Global settings: one focused editor for shared Match preferences, with saved and error states.
- Collection: a responsive Character-card grid and detail editor with generated portraits,
  built-in copy, custom create/edit/delete, local portrait replacement, and explicit full-ability
  guidance. The same shell can add a separate game-card catalog without merging its data model.
- Board management: built-in and custom board list, color-labeled role-count steppers, derived 6-24
  player total, per-seat default Character selectors, sheriff switch, victory selector, copy, save,
  edit, and confirmed deletion.
- New match: available-player-count selection, compatible built-in or custom board summary, ordered
  seat assignment defaulted to the first persisted Agent Profile, per-seat Agent Profile selector,
  inherited and overridable Character selector, color-labeled board composition and manual identity
  selector, editable Character-name nickname default, duplicate nickname feedback, per-seat reroll,
  and reroll-all. Built-in board descriptions preserve authored line breaks and wrap without
  resizing or clipping role badges.
- Spectator: a `100dvh` shell with an integrated status HUD, portrait-aware left and right player
  rosters, a center presence stage, and an independently scrolling event feed. Nickname remains
  primary, Character name is public secondary context, and every player card carries its configured
  model and visibility-safe role badge. Left-rail name, identity, Session status, and model metadata
  align to the left edge; the same four fields align to the right edge on the right rail. Speech,
  system events, night information, votes, and resolutions use distinct presentation. History folds
  by match day.
- Postgame review keeps the speech feed primary. A compact strip owns the ten-second controls,
  progress, current speaker, and final awards. Player ratings and radar details open in a docked
  inspector: desktop allocates a separate right column without overlap; below 900px, opening the
  inspector explicitly switches away from the feed and `返回发言` restores it. The player-rating
  selector always identifies each seat by nickname; completion controls whether that player's
  rating is available. Player cards show rating progress and MVP/SVP status. The `对局复盘` feed
  group begins with a persistent system message and, after aggregation, shows both award winners,
  vote totals, and complete five-axis radar values before the sequential reflection speech bubbles.
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
  context-audit status. Each participant row places its complete role badge at the right edge of
  the seat-heading row, with nickname and configured model below. Minimap nodes select and center
  their Record. Player switching keeps the shell mounted and restores each player's ledger scroll
  position.

## Live-state rules

- Session status changes push snapshots to the client; the HUD never polls every frame.
- A structured action accepted by the gateway displays as `已提交`. Vote prompts display `投票中`, and the stage displays `等待玩家提交投票` without a rotating presence orb or player ring. The signal rail continues a low-frequency pulse.
- Session bootstrap displays `同步中`. Replacement-session bootstrap displays `正在恢复玩家会话` without exposing hidden actor order.
- God view can show every seat's runtime status. Player view can show the selected player's private status plus public speech. Closed-eye view receives no hidden night actor status.
- Switching views covers the current projection before requesting the next one.
- Reconnecting preserves the last snapshot and displays active connection recovery feedback.
- An ended game exposes final identities but stays connected while postgame review is active or
  paused. Completed and skipped review publish the settled connection label, mark every Session as
  ended, and clear all presence, waveform, and player-ring loops.
- A missing or deleted Match replaces retained content with the unavailable state and performs no further retry.
- Waiting feedback never invents percentages, model reasoning, or completion estimates.
- Role effects use one pointer-transparent overlay and player-card anchors. Full mode adds bounded
  particles and stage-only impact movement; reduced mode keeps a static emblem and target pulse;
  off mode consumes cues without drawing them. The system reduced-motion preference defaults to
  reduced mode. Sheriff election and transfer use the same adapter and amber signal language.
- Standing candidates display a raised-hand icon and `上警` label on their player cards while the
  election is active.
- Automatic speech playback is owned by one live spectator connection and follows its current
  server projection. Complete streamed sentences play immediately; commit flushes only the final
  tail and binds completion to the event sequence. The feed shows only skip on the active automatic
  item and disables manual history playback until the automatic queue is idle. Each committed
  speech otherwise exposes manual play and stop controls. Speech synthesis errors skip the current
  item and report the outcome without blocking the Match.
- Vote result cards use target-grouped seat labels such as `投1号：2号、3号、4号`; player nicknames are omitted from the result title and ballot rows. Wolf results label null ballots as `空刀`, identify replay-stable tie selection, and appear only in god and Werewolf player projections supplied by the server.

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
layout. Character coverage includes catalog CRUD, local portrait upload, board defaults, Match
overrides, repeated Characters, duplicate nickname blocking, and public portrait projection. Agent
Profile coverage includes name/model separation, whole-row drag feedback, keyboard
reordering, reload persistence, and new-Match defaults.
Postgame coverage includes countdown start/skip, a persistent start message, immediate per-player
rating visibility, feed-level MVP/SVP vote totals and radar details, badges, active-review reconnect,
streamed reflections without duplicate committed text, final playback resolution, and completed/skipped settlement.
