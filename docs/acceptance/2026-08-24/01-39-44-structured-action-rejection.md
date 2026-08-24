# Structured action rejection acceptance

Evidence time: 2026-08-24 01:39:44 +08:00

## Scope

Retained acceptance evidence for structured action rejection acceptance.

## Evidence

The authenticated MCP integration called `submit_night_action` with a Witch poison action whose
semantic validator returned `Poison has already been used`. The tool response carried an error
flag and the rule message, no action entered the mailbox, and a corrected pass using the same
player token and open expectation was accepted.

The six-player orchestration integration submitted an unavailable Guard ability during the Seer
turn, received the phase rule rejection, and submitted the required Seer inspection inside the
same ACP Prompt. The inspection settled with no `match.paused` or `match.resumed` event. Engine
coverage also verified that semantic validation leaves the event log and state snapshot unchanged.
