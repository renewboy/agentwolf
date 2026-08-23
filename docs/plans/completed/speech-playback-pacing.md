# Speech playback pacing

## Goal

Play every player speech visible to the controlling spectator view in sequence. Agent turns may
continue inside the same sequential speech phase, while the final speech holds the following
phase transition until the browser finishes or skips the visible playback queue. Every committed
speech also exposes independent manual play and stop controls that never affect match progression.

## Completed work

- The rule engine supports an explicit deferred action boundary and resumes it without duplicate
  speaker activation, including after event-log restoration.
- Sequential speech continues inside one stage. Its final committed speech establishes the phase
  boundary consumed by the runtime playback coordinator.
- One live connection owns automatic playback, follows validated view changes, resolves exact
  committed event sequences, and releases its boundary on disconnect or hidden projection.
- The browser queues visible speeches by sequence through one Speech Synthesis controller. The
  active automatic item exposes skip; every committed item otherwise exposes manual play and stop.
- Responsive assets, localized copy, presence state, centralized API enforcement, current-state
  documentation, and acceptance evidence cover the delivered behavior.

## Completion evidence

- 61 unit and integration scenarios passed with 87.82% line and 73.37% branch coverage.
- `pnpm check` passed architecture, artifacts, docs, skills, typecheck, lint, formatting, hygiene,
  duplication, coverage, and production build gates.
- Eight Chromium scenarios passed, including sequence-keyed playback, manual controls, skip,
  synthesis failure, responsive layout, view switching, and terminal synchronization.
- An isolated production browser session rendered the audio controls, completed visible speech
  playback through a phase boundary, and emitted no warning or error.
