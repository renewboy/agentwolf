# Speech playback pacing

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for speech playback pacing.

## Evidence

Engine coverage held a final day speech at its explicit action boundary and restored that boundary into the exile-vote phase after a pause. Server integration generated both six-player Werewolf council speeches while retaining `phase-night-wolf-council`; no wolf-vote prompt existed until the exact final speech sequence was completed. A wrong sequence produced `speech-playback-invalid-resolution`, a second controller produced `speech-playback-controller-busy`, and a closed-eye controller advanced through private wolf speech without a playback hold.

Chromium playback coverage used two committed events with identical text and observed two separate utterances. Skipping the first event sent no phase-resolution message, completing the final event sent its exact sequence and changed the visible phase to daytime voting, and a synthesis error resolved the final sequence as skipped. Each committed speech exposed manual play and stop; manual stop emitted no game-progress message, automatic playback exposed only skip, and history controls stayed disabled while the automatic queue was active.

An isolated production build ran against an in-memory database at 1280×720. The real browser exposed the connection-owned audio toggle and per-speech play controls, rendered both Werewolf speeches, advanced from council to wolf attack after browser speech completion, and reported no warning or error. The isolated Match, Profile, Tool, and workspace were separate from user runtime data.
