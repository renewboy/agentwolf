# Preflight research

## Rule baseline

AgentWolf treats a board as a versioned rule set because common Werewolf implementations differ in night order, self-save, guard and antidote interaction, sheriff interruption, and last-word policy.

The 6-player preset uses two Werewolves, two Villagers, Seer, and Hunter. It has no sheriff, reveals eliminated roles, and uses slaughter-all victory. The 9-player preset uses three Werewolves, three Villagers, Seer, Witch, and Hunter with sheriff election and slaughter-edge victory. The 12-player Standard board uses four Werewolves, four Villagers, Seer, Witch, Hunter, and Idiot. The official rules define a sheriff with a final daytime speech and 1.5 vote, slaughter-edge victory, first-night-only night last words, Witch one potion per night with no self-save, Hunter firing only after wolf kill or exile, and Idiot surviving exile while losing the vote. The Guard board uses the same player count and replaces Idiot with Guard; Guard can protect one player and cannot protect the same player on consecutive nights.

The 10-player Mirror Hidden board uses two pack Werewolves, Awakened Hidden Wolf, four Villagers,
Magic Mirror Girl, Witch, and Guard. Awakened Hidden Wolf is an isolated Werewolf-faction Role:
the pack and the isolated Role do not know one another, the pack can attack it, and it cannot
self-destruct. It may wait or learn one living player once. Learning immediately changes the
exact-role result seen by Magic Mirror Girl, activates copied Hunter eligibility that night, and
activates other copied night abilities on the following night. When no pack Werewolf remains, it
receives a nightly attack. Learning Werewolf grants one double attack after awakening; choosing
the same target twice ignores Guard and antidote protection.

The sheriff election runs after first-night actions and before first-night deaths are announced. Candidates speak, may withdraw, and original non-candidates vote. A tie creates one runoff speech and vote; a second tie loses the badge. V1 uses the single-explosion badge-loss policy.

The first sheriff-campaign speaker is selected randomly, then candidates continue in seat order.
For daytime speech, a living Sheriff chooses the direction and speaks last: a single night death is
the anchor for dead-left or dead-right, while a peaceful night or multiple deaths uses the Sheriff
as the anchor for Sheriff-left or Sheriff-right. Without a Sheriff, a single death remains the
anchor with a random direction; multiple deaths use the lowest-seat death with a random direction;
a peaceful night uses a random start and direction. Random choices are deterministic per Match and
persist through the emitted actor/order events.

Night interaction prompts follow `Guard -> Werewolves -> Witch -> Seer`. The board manifest owns this order. Resolution is effect-based and does not depend on a core switch statement. The default Guard board applies guard-and-antidote collision as a death and keeps Witch self-save disabled.

The regular Werewolf attack uses one private ballot per living Werewolf. A `null` ballot is an
explicit no-kill choice and must strictly outpoll every player target. A highest-vote tie selects
one of the tied player targets through a Match- and night-stable random choice. Pack members may
target themselves or one another.

Sources:

- [Official role, board, victory, and last-word rules](https://langrensha.com/wanfa/guize/2017/10/18/26899_719311.html)
- [Official first-day sheriff flow](https://www.taptap.cn/moment/658304304670575860)
- [Detailed sheriff tie and interruption variants](https://zh.wikiversity.org/zh-cn/%E7%8B%BC%E4%BA%BA%E6%AE%BA/%E9%81%8A%E6%88%B2%E8%A7%92%E8%89%B2/%E8%AD%A6%E9%95%B7)
- [Werewolves of Miller's Hollow rulebook](https://www.gokids.com.tw/tsaiss/gokids/rules/BestOf_EN_CH%20rules.pdf)
- [Awakened Hidden Wolf board and inspection behavior](https://shouyou.gamersky.com/news/202409/1811620.shtml)
- [Awakened Hidden Wolf role and copied abilities](https://langrensha.net/news/20240905-5.html)

## Extension pressure from complex roles

- Miracle Merchant grants one stateful, one-use inspection, poison, or guard ability. A wolf target receives nothing and causes the Merchant to die. Granted actions remain separate from the target's native action and participate in the same collision rules. This requires ability instances, grants, independent usage state, and delayed consequences.
- Magician swaps two seat targets for one night. Night attacks, poison, and inspection resolve through the mapping while identities and faction knowledge remain unchanged. This requires a target-resolution layer before effects.
- Cupid creates two lovers on the first night. One lover's death chains to the other, and a cross-faction pair changes victory. This requires relationship state, chained death, and dynamic allegiance or victory modules.
- Piper marks two other players each night and wins independently when every other living player is charmed, even when ordinary deaths make the condition true. This requires status markers and victory evaluation after every settled state change.

Sources:

- [Official Miracle Merchant rules and Q&A](https://www.taptap.cn/moment/19875502311345790)
- [Official Magician rules](https://www.taptap.cn/moment/15230317019267075)
- [Cupid and Piper rulebook sections](https://www.gokids.com.tw/tsaiss/gokids/rules/BestOf_EN_CH%20rules.pdf)

## Agent Skills

A Skill is a reusable workflow with a concise `SKILL.md` entry point and optional scripts, references, and output assets. Name and description support discovery; detailed conditional material is loaded progressively. Project skills stay narrow, preserve authorization, and use deterministic scripts where repeated parsing or submission benefits from code. New skills are initialized and validated with Skill Creator.

Sources:

- [OpenAI: Save workflows as skills](https://learn.chatgpt.com/use-cases/reusable-codex-skills)
- Local Skill Creator instructions at `/Users/bytedance/.codex/skills/.system/skill-creator/SKILL.md`

## Harness Engineering

The repository is the agent-readable system of record. `AGENTS.md` is a short map; deeper current-state documents own product, architecture, testing, and design. Mechanically checkable rules are enforced through scripts, tests, hooks, and CI with remediation-oriented failures.

The DeepSeek Harness reference was inspected at `origin/master@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Its relevant patterns are a small instruction map, explicit package direction, one gate scheduler, generated or checked documentation, lightweight local hooks, exhaustive CI lanes, snapshots for user/model-visible behavior, architecture ratchets, and tests for the CI configuration itself. AgentWolf applies the pattern at project scale rather than copying its package count or implementation framework.

Sources:

- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)
- `/Volumes/media/deepseek-harness` at the commit above

## ACP baseline

ACP is the process-neutral boundary. A client initializes one agent process, creates a session with an absolute working directory and MCP servers, reads model choices from the returned configuration options, sends prompts using the returned session ID, consumes `session/update` notifications, and ends each turn on the final response. Text streams through `agent_message_chunk`.

Trae CLI 0.201.1 exposes native `traecli acp serve`. Codex CLI 0.142.5 and Claude Code 2.1.123 on this machine do not expose native ACP commands, so the built-in tool catalog uses the maintained `@agentclientprotocol/codex-acp` and `@agentclientprotocol/claude-agent-acp` adapters. Custom profiles can run any ACP stdio command.

Sources:

- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [ACP agent registry](https://agentclientprotocol.com/get-started/agents)
- [Codex ACP adapter](https://www.npmjs.com/package/%40agentclientprotocol/codex-acp)
- [Claude ACP adapter](https://github.com/agentclientprotocol/claude-agent-acp)
