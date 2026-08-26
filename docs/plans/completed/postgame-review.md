# Postgame review

## Goal

Provide one durable single-Match postgame review after the game result. The review retains every
seat's existing ACP Session, publishes accepted review sheets immediately, aggregates role-neutral
MVP/SVP ratings, and streams all seat reflections through the ordinary speech and playback UI.

## Completed work

- The victory registry exposes explicit winning Player IDs. Postgame MVP eligibility consumes that
  set and SVP eligibility consumes its complement without concrete faction or Role branches.
- Schema eight directly includes separate postgame state, sheet, reflection, and attempt tables.
  The development SQL data was reset instead of adding a postgame migration or another schema
  version.
- A server-owned ten-second countdown supports immediate start or countdown-only skip. Collecting,
  speaking, paused, completed, and skipped states persist and recover independently of game events.
- Every seat submits one validated MVP/SVP ballot and a complete five-dimensional sheet. Accepted
  sheets persist before the MCP receipt and project immediately, while other Agent Prompts remain
  frozen at the terminal snapshot.
- Equal-weight arithmetic averages resolve awards by vote count, exact score total, then a
  Match-stable draw. Raw reviewer sheets and final aggregates remain separately available.
- Sequential reflections reuse direct-speech capture, Player-reference cleanup, live speech chunks,
  ordinary speech bubbles, manual playback, automatic sentence playback, and the final playback
  barrier.
- Review transport resumes only unfinished work on the original Session IDs. A first uncertain
  failure retries the same stage; repeated failure pauses for an explicit same-Session continue.
- The Match page includes a compact countdown/progress strip and an optional review inspector.
  Desktop uses a non-overlapping feed-plus-inspector grid; narrow viewports explicitly switch
  between inspector and speech feed. Reviewer sheets, badges, accessible radar values, final
  results, and review-aware connection settlement remain available without covering dialogue.
- Simulation capture excludes postgame rows and Turns, and production simulation orchestration
  disables the postgame coordinator so the reviewed game-event corpus remains unchanged.

## Completion evidence

- `pnpm check` passed architecture, artifact, documentation, Skill, type, lint, format, dependency
  hygiene, zero-duplication, 44 test files, 168 tests, coverage, and production build.
- Coverage passed at 87.89% lines, 84.69% statements, 88.36% functions, and 72.29% branches.
- `pnpm simulation:check` reported all three approved fixtures valid with unchanged game semantics.
- `pnpm test:e2e` passed all 21 Chromium scenarios, including immediate individual-sheet display,
  streamed postgame speech bubbles, terminal settlement, and a 760px responsive viewport.
- Focused integration coverage proved countdown-only skip, no partial aggregate, final playback
  hold, postgame cascade deletion, frozen reviewer Prompts, and restart recovery of all six original
  Session IDs while prompting only the one unfinished reviewer.
- A real isolated Codex ACP 1.6.2 Session using `gpt-5.6-luna` submitted the complete
  `submit_postgame_review` payload and then produced one direct reflection over 20 streamed chunks.
- In-app browser verification loaded the fresh schema-eight local application with no console
  warnings or errors; rendered postgame desktop and mobile states were verified through Chromium.
