# Frontend direction

AgentWolf presents a desktop-first live strategy-game stage for human spectators. Its visual language
is a moonlit tribunal: restrained, information-dense, and clearly alive without imitating model
reasoning or invented progress.

The technical browser boundary lives in [Web client architecture](architecture/web-client.md). The
visual reference is [match-stage.png](design/reference/match-stage.png), generated from
[match-stage.prompt.md](design/reference/match-stage.prompt.md); [match-motion.md](design/reference/match-motion.md)
defines event-driven motion. The reference image is not a runtime background.

## Visual system

- Base palette: ink navy, graphite, desaturated silver, warm amber, and a deep crimson decision
  accent.
- Typography: readable Chinese sans for controls and transcript, with a restrained Song-style display
  face for the product title.
- Surfaces: compact controls, bounded stage panels, circular player medallions, low-contrast gradients,
  inset highlights, lunar haze, and static grain rather than glass or neon decoration.
- Phosphor is the icon family. Emoji are not interface icons.
- Visible identities use one labeled semantic Role badge system across setup, Match, and developer
  views. Hidden identities use one neutral badge and never expose a Role-specific color.

## Layout principles

- The live Match uses a `100dvh` shell. The document does not scroll; the center feed owns its
  independent history range.
- Desktop player rails remain visible on both sides of the center stage. Narrow layouts combine them
  into a horizontal player HUD without hiding identity-safe state.
- Nickname is the primary Match identity. Character name, portrait, Agent configuration, and visible
  Role state remain structured secondary information.
- Postgame keeps the speech feed primary. Rating detail uses a separate inspector; narrow screens
  switch explicitly between inspector and feed rather than overlaying dialogue.
- Modal and listbox bodies own their internal scrolling and remain within mobile safe areas.

Exact page composition belongs to React components and browser tests, not this direction document.

## Interaction feedback

Production selection controls use `GameSelect`; destructive actions use `ConfirmDialog`. Native
`<select>` elements and browser alert, confirm, or prompt APIs are not product controls.

Listboxes support arrow keys, Home, End, Enter, Escape, type search, selected state, and internal
scrolling through a portal that is not clipped by parent containers. Confirmation dialogs use the
application overlay and visual tokens, focus the safe action first, trap focus, support Escape, block
background keyboard and pointer input, and restore trigger focus when closed.

Interaction state uses text, icons, shape, or accessible state in addition to color. Control copy
comes from `packages/assets/copy`; control styles come from `packages/assets/styles`.

Drag-and-drop provides a following drag image, lifted source, insertion marker, and equivalent
keyboard ordering. Every asynchronous action exposes an explicit idle, working, success, empty, or
error state.

Repository checks reject native controls and browser prompt APIs. Browser coverage exercises opening,
selection, cancellation, confirmation, keyboard navigation, focus containment, and focus restoration.

## Live feedback

Waiting states communicate connection, synchronization, Agent work, and recovery without percentages,
reasoning text, or completion estimates. Continuous feedback uses transform and opacity and stops
when the state settles.

Session and phase status comes from server snapshots. Closed-eye and unrelated-player views do not
render private actor status. View switching covers the old projection until the next projection is
ready. Transient reconnect preserves the last valid screen; terminal unavailable state removes it and
does not keep retrying.

## Motion and audio

Motion explains state change: startup, waiting, streamed speech, phase transition, vote resolution,
Role action, recovery, and terminal result.

Automatic speech playback identifies one active item and offers skip; manual history playback remains
disabled until that queue is idle. Committed speech otherwise exposes manual play and stop. Audio
failure releases progression and reports a visible outcome instead of blocking the Match.
