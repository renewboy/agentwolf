# AgentWolf Role development Skill acceptance

Evidence time: 2026-08-26 01:08:18 +08:00

## Scope

Verified the project coding-agent Skill for new AgentWolf Role development, including current
engine plugin extension points, ruleset snapshot compatibility, Prompt and presentation ownership,
visibility-safe effects, board and strategy integration, and cross-layer verification guidance.

## Evidence

- Skill Creator `quick_validate.py` accepted
  `.agents/skills/agentwolf-role-development` with complete frontmatter and no scaffold markers.
- Local link and path checks resolved every Skill reference and every named current integration
  owner used by its realistic Role-development walkthrough.
- `pnpm check:skills` accepted project coding Skills under `.agents/skills`, rejected player-only
  Skill placement there, and validated the new Skill entry point and UI metadata.
- `pnpm check` passed architecture, artifact, documentation, Skill, type, lint, format, dependency
  hygiene, zero-duplication, 40 test files, 150 tests, coverage, and the production build.
- Coverage was 89.61% lines, 86.57% statements, 90.71% functions, and 74.09% branches.
- `git diff --check` passed. The request changed no game rules, runtime Prompt rendering, approved
  simulation fixtures, or browser-visible product behavior.
