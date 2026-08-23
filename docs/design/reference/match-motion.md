# Match motion specification

The match screen is a fixed-height event-driven HUD. Motion communicates live state and returns to rest after every discrete event. Continuous motion is limited to active waiting states and the low-frequency lunar atmosphere.

## Feedback tiers

| Tier | Duration | Ease | Use |
| --- | ---: | --- | --- |
| Small | 140-220 ms | `power2.out` | hover, press, focus, new status |
| Medium | 320-520 ms | `power3.out` | message entry, day disclosure, player completion |
| Large | 520-760 ms | `power4.out` then settle | day/night transition, vote result, elimination, winner |

## Presence states

| State | Visible response | Exit |
| --- | --- | --- |
| Loading | full three-column skeleton, moving lunar scan, live status copy | first snapshot |
| Starting | seat medallions illuminate as sessions become ready | match running |
| Thinking | active status ring rotates, signal path breathes, center presence copy remains visible | action or speech chunk |
| Awaiting actions | sealed-action motif and ambient signal movement without public actor identity | resolution event |
| Streaming | text chunks appear with cursor and waveform movement | committed speech |
| Resolving | phase veil and focused result-stage movement | stable next phase |
| Reconnecting | retained snapshot plus moving connection rail | socket open |
| Switching view | opaque privacy veil covers the old projection before replacement | new projection |
| Paused | low-frequency warning border and actionable dialog | resume or delete |
| Ended | one winner reveal, then a stable terminal composition | terminal |

## Event transitions

- Day and night use a 600 ms color-temperature and phase-title transition. It never blocks game state.
- Player speech enters from the side of that player's rail. The bubble settles without bouncing.
- Vote results reveal totals in descending order, then emphasize the selected or tied result once.
- Elimination applies one brief contraction and desaturation to the seat medallion.
- Sheriff transfer moves the crown between seat anchors with GSAP Flip.
- View switching covers the complete stage before requesting the replacement projection.

## Continuous motion constraints

- Animate only `transform` and `opacity` in continuous loops.
- Pause ambient timelines while the document is hidden.
- Do not update React state per frame.
- Do not show invented percentages, progress, or reasoning steps.
- Reduced-motion mode removes spatial loops and preserves explicit status copy and live content changes.
