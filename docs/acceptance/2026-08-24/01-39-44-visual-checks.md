# Visual checks

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for visual checks.

## Evidence

The match stage stayed exactly equal to the viewport at 3456×1760, 1440×900, 1024×768, and 390×844. The document remained at `scrollY = 0`; the center feed retained its own scroll range, and the mobile player HUD replaced both side rosters below 900px.

A delayed six-player Mock ACP match exposed `reconnecting`, `starting`, `streaming`, and `thinking` in the browser. The visible thinking ring changed transform across a 350ms sample, the center presence stage named the live state, and the browser reported no page or console errors. A 9.72-second browser recording captured startup, streaming, thinking, and paused feedback. Closed-eye projection hid every private seat runtime status while the selected player view retained only its own private status.

The application listbox rendered through its Portal with the dark game-control surface, constrained internal scrolling, selected-state mark, and keyboard navigation. The destructive confirmation layer covered the application, focused cancel first, closed on Escape, restored trigger focus, and completed deletion without browser-native prompts. Suite teardown left zero test Matches, zero test Agent Profiles, and zero custom test Agent Tools in the reusable local server.

The live Agent settings page rendered every profile name and model on separate lines, made every row
draggable, and exposed a grab cursor across each row. The live new-Match page assigned the persisted
first profile to all 12 seat selectors and reported no browser warning or error. Isolated Chromium
coverage started a drag from the right side of a profile row, observed the lifted source and target
insertion line, completed the reorder, repeated it with Arrow/Home keys, reloaded the page, verified
the persisted order, and then verified all 12 setup defaults before deleting the test profile.

The simulation dialog retained the current ink, graphite, amber, and crimson visual language at
desktop and 390×844 mobile sizes. Its mobile bounds were `x=8`, `y=8`, `374×828` inside a 390×844
viewport, document width remained 390, the body scrolled independently, and browser warning/error
logs were empty. Busy work blocked Escape dismissal; cancellation and completion restored focus to
the originating Match-row action. Browser review of `simulation-ended-fdcbb2961d962824` displayed
35 Turns, 180 events, all four checks as passed, and an enabled approval action; the review was
cancelled without writing a fixture or changing the source Match.
