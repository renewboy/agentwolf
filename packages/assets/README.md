# Assets package

`@agentwolf/assets` 持有仓库创作的模型呈现素材与可复用的浏览器呈现素材。

## 职责

- Prompt bundle 源、AgentWolf manifest/facts adapter 与严格渲染支持；路径、import、audience、matcher
  和 semantic coverage 基础由固定 Core prompt runtime 提供。
- 玩家 Skill 源码树及其构建输入。
- 本地化 UI 文案、旁白、Role 与 Ability 标签,以及昵称词库。
- 内置 Character 卡与托管的头像元数据。
- Role 效果呈现目录、图标、时序元数据、CSS 与 design tokens。

Prompt 架构定义在 [Prompt 与玩家上下文](../../docs/architecture/prompt-and-context.md)。浏览器消费定义在 [Web 客户端架构](../../docs/architecture/web-client.md)。

## 导出边界

主包入口导出浏览器安全的文案、Character、旁白、昵称、plugin-event 与 role-effect 素材。仅 server 使用的 Prompt 与玩家 Skill 构建器使用显式的 `./prompts` 与 `./player-skills` 子路径,绝不进入 Web bundle。

Assets 依赖 AgentWolf contracts 与 Core prompt runtime,但不依赖 game engine 或 server。server 将已安装
的 Ruleset 语义适配为纯 asset 侧的 Prompt 清单与可见事实。
