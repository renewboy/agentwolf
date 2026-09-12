# Assets package

`@agentwolf/assets` 持有仓库创作的模型呈现素材与可复用的浏览器呈现素材。

## 职责

- Prompt bundle 源、AgentWolf manifest/facts adapter 与严格渲染支持；路径、import、audience、matcher
  和 semantic coverage 基础由固定 Core prompt runtime 提供。
- 玩家 Skill 源码树及其构建输入。
- 本地化 UI 文案、旁白、Role 与 Ability 标签,以及昵称词库。
- 内置 Character 卡与托管的头像元数据。
- Character 半身原画、五官坐标与独立的局部动态定义。
- Character 参考音频、音色映射与中文来源记录。
- Role 效果呈现目录、图标、时序元数据、CSS 与 design tokens。

Prompt 架构定义在 [Prompt 与玩家上下文](../../docs/architecture/prompt-and-context.md)。浏览器消费定义在 [Web 客户端架构](../../docs/architecture/web-client.md)。

## 导出边界

主包入口导出浏览器安全的文案、Character、旁白、昵称、plugin-event 与 role-effect 素材。仅 server 使用的 Prompt、玩家 Skill 构建器和参考音色使用显式的 `./prompts`、`./player-skills` 与 `./voices` 子路径,绝不进入 Web bundle。

Assets 依赖 AgentWolf contracts 与 Core prompt runtime,但不依赖 game engine 或 server。server 将已安装
的 Ruleset 语义适配为纯 asset 侧的 Prompt 清单与可见事实。

## Character 立绘

`characterPerformance(snapshot)` 根据 Character 与肖像资产标识解析浏览器安全的立绘定义，未注册
的人设返回 null。[立绘素材契约](characters/performances/README.md)持有原画、透明通道与坐标约定。

## Character 参考音色

`@agentwolf/assets/voices` 导出只读的 `builtInCharacterVoices`，每项包含 `characterId`、
`referenceFile`、`referenceText`、`sha256` 与 `revision`。`revision` 包含参考文件摘要与对应对白，供生成缓存区分音色。
`builtInCharacterVoiceFile(characterId)` 返回对应的 FLAC 文件名；没有绑定时返回 `null`。
server 将文件名解析到项目根目录下的 `packages/assets/voices`。清单入口使用 Zod 校验 Character ID、
文件名与 SHA256，并拒绝重复的 Character 或参考文件。

`voices/` 中的参考音频使用 FLAC 无损保存，保留采样点、采样率与位深。
`voices/sources.json` 记录来源 URL、配音版本、选段、音频摘要与试听状态。
该目录仅保存参考音频与清单；生成试听、原视频及处理过程文件属于运行时数据目录。
