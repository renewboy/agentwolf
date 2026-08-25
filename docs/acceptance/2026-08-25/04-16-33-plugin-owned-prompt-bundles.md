# Plugin-owned Prompt bundles acceptance

Evidence time: 2026-08-25 04:16:33

## Scope

Validate plugin-owned, non-localized Nunjucks Prompt bundles; strict visible-fact rendering;
independent Witch potion legality; semantic contribution ownership; Prompt metadata cleanup;
server-only dependency isolation; and unchanged deterministic game behavior.

## Evidence

- `pnpm check` passed all architecture, artifact, documentation, Skill, type, lint, format,
  hygiene, duplication, coverage, and build gates. Coverage executed 40 files and 147 tests.
- `pnpm simulation:check` passed all 3 approved fixtures with their complete engine and
  orchestration variant matrix and unchanged reviewed semantic event digests.
- `pnpm test:e2e` passed 18 Chromium scenarios, including Match setup, live visibility,
  trajectories, simulation review, playback pacing, vote privacy, terminal state, and recovery.
- The synthetic Prompt-bundle tests installed a new Role, Ability, Phase, and plugin event without
  production catalog edits, and rejected missing ownership, locale axes, audience violations, and
  ambiguous event matchers.
- Witch rendering tests covered both potions available, poison spent, both potions spent, hidden
  attack information, and pass-only output when no potion action is legal.
- The schema-seven database test removed legacy Turn metadata while preserving the stored Prompt
  Record byte-for-byte.
- The production Web build contains no `nunjucks`, `PromptBundleRegistry`, or
  `player-contract.njk` marker.
- `PATH=/Users/bytedance/.local/bin:$PATH pnpm smoke:player-action -- gpt-5.6-luna
--tool=trae-cli` completed through Trae CLI 0.201.5, used one isolated Session, submitted the
  accepted `player-1 -> player-2` wolf-kill vote, ended normally, and reported 5,467 used context
  tokens.
- `pnpm smoke:player-action -- gpt-5.6-luna --tool=codex` completed through Codex ACP 1.6.2,
  used one isolated Session, submitted the accepted `player-1 -> player-2` wolf-kill vote, ended
  normally, and reported 6,219 used context tokens.
