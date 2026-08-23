# Character persona system

## Goal

Provide reusable public Character cards that shape an Agent's expression without changing its
reasoning quality, Werewolf identity, legal actions, visibility, or canonical Match nickname.

## Completed work

1. Added branded Character and portrait contracts, twelve read-only Detective Conan cards,
   generated 1024×1024 portraits, Git LFS routing, custom copy/edit/delete, local PNG/JPEG/WebP
   normalization, content-addressed media, SQLite persistence, and reference-safe deletion.
2. Added per-seat custom-board defaults and Match overrides. Repeated Characters are valid;
   duplicate trimmed nicknames block Match creation. Every Match stores the resolved Character card
   as an immutable seat snapshot.
3. Added Prompt-contract-18 portrayal with only the owning Character card, an explicit full-reasoning
   boundary, and nickname-only player identity. Recovery, trajectory audit, and sanitized simulation
   normalization reconstruct the same contract without adding Character data to the game engine or
   domain events.
4. Added the Collection Character library, portrait upload and editor, board and Match selectors,
   duplicate-name feedback, and public portrait/name presentation alongside separately visible game
   roles.
5. Updated architecture and artifact gates, current-state product and engineering documentation,
   migration coverage, unit and integration coverage, browser coverage, and acceptance evidence.

## Completion evidence

- `pnpm check` passed architecture, artifacts, docs, Skills, strict TypeScript, Oxlint, Oxfmt, Knip,
  zero-clone JSCPD, 117 covered tests, and the production build. Coverage was 89.02% lines, 86.21%
  statements, 91.00% functions, and 75.33% branches.
- `pnpm test:e2e` passed all 16 Chromium scenarios, including Character copy/edit, real browser
  PNG-to-WebP upload, repeated board defaults, duplicate nickname blocking, and Match overrides.
- The three-fixture deterministic simulation corpus and every configured replay variant passed.
- Real retained Match `match-board-6-20260824-8288022-aabec6768ba1` used six Character portraits and
  six Trae ACP Sessions, ended on day two with 248 events and no pause, and passed exact audit of all
  34 player Turns with zero issues. All six foundations contained the owning card and full-ability
  boundary and contained no other seat's Character card.
