# 玩家攻略能力验收

Evidence time: 2026-08-25 16:18:24

## Scope

验证公开角色介绍、中文攻略索引与正文、本地跳转、共享构建目录、玩家工作区软链接、只读检索边界、发言隔离和新增角色攻略门禁。

## Evidence

- 攻略包含 28 个角色页和 973 篇正文；Skill 目录共 1004 个文件，两份玩家 Skill 共 1007 个文件。
- `pnpm build` 将 `packages/assets/player-skills` 完整复制到 `.agentwolf/skills`；目录比较无差异。
- 工作区测试确认 `.agents/skills`、`.claude/skills`、`.trae/skills` 均为相对软链接并解析到同一共享目录。
- `pnpm check:skills` 验证全部攻略页可从入口到达、链接存在、正文不是摘要、不含“资料来源”，并要求每个已安装角色具有攻略映射和来源一致的公开角色介绍。
- `2023080801.md` 包含“内心认同角色”“发言模板分享”“统一战线”“不怕死的态度”“逆向思维”及本地相关阅读跳转。
- Trae CLI 0.201.5 真实会话提交 `player-1 -> player-2` 夜间投票，通过只读 Bash 在攻略正文中命中“统一战线”；写文件返回 `operation not permitted`，本地 HTTP 访问失败，标记文件不存在。
- Codex ACP 1.6.2 真实会话提交相同有效投票，通过原生 shell 工具命中攻略正文；写文件返回 `Operation not permitted`，本地 HTTP 访问失败，标记文件不存在。
- Claude 适配器接受 Read、Grep、Glob、Bash、Skill 与失败即停的沙箱配置并建立会话；首次模型请求由账号状态返回 `400 This organization has been disabled`。
- `pnpm check` 通过架构、交付物、文档、Skill、类型、静态检查、格式、依赖卫生、重复检查、40 个测试文件、150 个测试、覆盖率和构建门禁。
- `pnpm test:e2e` 通过 18 个 Chromium 场景。
