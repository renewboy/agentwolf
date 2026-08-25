# 玩家攻略能力

## Goal

为每个玩家提供公开角色介绍、完整攻略索引和按需查阅能力，同时保持长期会话、信息可见性、自然发言流和五种结构化游戏行动。

## Completed work

- `agentwolf-player` 与 `werewolf-strategy` 是两份独立 Skill。
- 中文攻略包含 28 个角色页和 973 篇正文，角色与文章之间保持本地跳转。
- 每个公开角色段落包含来源角色介绍，所有玩家获得相同内容。
- Skill 源码位于 `packages/assets/player-skills`，构建时完整复制到 `.agentwolf/skills`。
- 每个玩家工作区的 `.agents/skills`、`.claude/skills`、`.trae/skills` 都通过相对软链接共享构建目录。
- Trae、Codex 和 Claude 仅开放本地读取、Skill 与只读 Bash；写入、Shell 网络和其他通用能力不可用。
- 攻略查阅可以发生在行动前；发言开始后的工具输出和第二版发言不会进入比赛事件。
- 仓库门禁要求每个已安装角色具有攻略映射和来源一致的公开角色介绍。

## Completion evidence

- 两份 Skill 的结构、索引、链接图和角色覆盖门禁通过。
- 构建产物与源码目录比较无差异，三套玩家软链接解析到同一共享目录。
- Trae 和 Codex 真实回合均提交有效游戏行动、检索攻略正文，并阻止文件写入和本地网络访问。
- Claude 接受工具与沙箱配置并建立会话；模型请求由当前账号状态拒绝。
- `pnpm check` 通过 40 个测试文件、150 个测试、覆盖率和完整构建。
- `pnpm test:e2e` 通过 18 个 Chromium 场景。
