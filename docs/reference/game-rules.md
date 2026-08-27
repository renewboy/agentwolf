# Adopted game-rule baseline

Werewolf implementations differ in night order, Witch self-save, Guard interaction, sheriff
interruption, last words, and victory. AgentWolf freezes the selected variant in each board snapshot;
the game engine and generated catalog remain the executable authority.

## Shared policies

- Ordinary elimination keeps Role identity hidden until a Role-specific public reveal or Match end.
- Standard sheriff boards use election after first-night actions and before death announcement.
  Candidates speak, may withdraw, and original non-candidates vote. One tie creates a runoff; a second
  tie loses the badge.
- A living Sheriff has 1.5 vote weight, chooses daytime speech direction, and speaks last. The current
  single-explosion policy loses the badge when a campaign explosion prevents election.
- Night last words are first-night-only where enabled.
- Witch uses at most one potion per night and cannot self-save. Guard and antidote on the same target
  resolve as death. Guard may self-protect but not protect the same player on consecutive nights.
- Night interaction order is Guard, regular Werewolf attack, Witch, then inspection Roles. The
  Ruleset phase graph owns the exact order.
- A regular wolf attack uses one private ballot per eligible pack member. `null` is explicit no-kill
  and wins only by strictly outpolling every player target. A highest player-target tie uses one
  Match- and night-stable choice.

Day speech order uses emitted replay-stable choices. With a living Sheriff, a single night death is
the dead-player anchor; peaceful or multiple-death mornings use the Sheriff as anchor. Without a
Sheriff, a single death or lowest-seat multiple death is the anchor; a peaceful night selects a stable
start and direction.

## Installed special variants

The Mirror Hidden board contains two pack Werewolves and one Awakened Hidden Wolf. The isolated Role
and pack do not know one another, can target one another, and do not share wolf council. Awakened
Hidden Wolf may learn once, receives copied abilities under their registered timing, and gains its own
attack after the pack is eliminated. Learning a Werewolf grants one double attack whose same-target
variant ignores Guard and antidote protection.

Magic Mirror Girl receives exact Role results and cannot inspect the same target twice. White Wolf
King joins the pack ballot but uses its own targeted daytime detonation rather than ordinary Werewolf
self-destruct. Resulting deaths pass through the shared trigger and victory pipeline.

## Sources

- [Official role, board, victory, and last-word rules](https://langrensha.com/wanfa/guize/2017/10/18/26899_719311.html)
- [Official first-day sheriff flow](https://www.taptap.cn/moment/658304304670575860)
- [Sheriff tie and interruption variants](https://zh.wikiversity.org/zh-cn/%E7%8B%BC%E4%BA%BA%E6%AE%BA/%E9%81%8A%E6%88%B2%E8%A7%92%E8%89%B2/%E8%AD%A6%E9%95%B7)
- [Werewolves of Miller's Hollow rulebook](https://www.gokids.com.tw/tsaiss/gokids/rules/BestOf_EN_CH%20rules.pdf)
- [Awakened Hidden Wolf board and inspection behavior](https://shouyou.gamersky.com/news/202409/1811620.shtml)
- [Awakened Hidden Wolf copied abilities](https://langrensha.net/news/20240905-5.html)
