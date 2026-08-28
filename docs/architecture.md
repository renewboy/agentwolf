# AgentWolf 架构

本文档是系统地图。每个主要运行时模块在一份子文档中拥有自己的详细架构;包内接口与限制放在
package 与 app 的 README 中。

## 运行时地图

```text
Web setup / spectator / developer UI
                 |
                 v
Fastify API + visibility-safe projector ------ SQLite repositories
                 |
                 +---- Match lifecycle and postgame coordination
                 +---- Action gateway and live synchronization
                 +---- ACP Session runtime ---- Agent processes
                 +---- Ruleset catalog -------- deterministic game engine
                 +---- Prompt registry -------- model context assets
                 +---- Trajectory audit ------- simulation runners
```

确定性引擎不执行任何 IO。server 负责组合、持久化、编排、可见性过滤和外部传输。浏览器只消费
经校验的投影 DTOs。

## Package 依赖方向

```text
contracts <- game-engine
    ^             ^
    |             |
 assets          acp
    ^             ^
    +------ server ------+
              ^
              |
             web
```

- [`packages/contracts`](../packages/contracts/README.md) 拥有跨边界标识符与 schemas。
- [`packages/game-engine`](../packages/game-engine/README.md) 拥有确定性规则与 replay。
- [`packages/acp`](../packages/acp/README.md) 拥有通用 ACP 协议与进程原语。
- [`packages/assets`](../packages/assets/README.md) 拥有 Prompt 与表现资产。
- [`apps/server`](../apps/server/README.md) 组合运行时模块与 IO。
- [`apps/web`](../apps/web/README.md) 呈现 server 投影的状态。

架构检查强制执行这一依赖方向。低层从不 import 高层以获得表现、持久化或编排行为。

## 模块架构

- [游戏运行时](architecture/game-runtime.md):Rulesets、插件、阶段、效果、胜负、replay。
- [Prompt 与玩家上下文](architecture/prompt-and-context.md):Prompt bundles、可见事实、
  Skills 与模型上下文。
- [ACP Session 运行时](architecture/acp-session-runtime.md):进程生命周期、持久 Sessions、
  actions、发言与恢复。
- [信息同步](architecture/information-synchronization.md):事件可见性、送达、barriers、
  回放、重连与终局状态。
- [Match 生命周期](architecture/match-lifecycle.md):配置目录、不可变快照、持久化、恢复、
  删除与赛后复盘。
- [轨迹与仿真](architecture/trajectory-and-simulation.md):诊断采集、语义审计、已审查
  fixtures 与确定性 runner。
- [Web 客户端](architecture/web-client.md):经校验的 DTO 消费、浏览器状态归属、角色特效
  执行与呈现生命周期。

## 变更路由

- 变更规则、Role 扩展点、阶段、效果或胜负契约:阅读游戏运行时。
- 变更模型可见事实、Prompt 归属或玩家 Skills:阅读 Prompt 与玩家上下文。
- 变更 ACP 启动、Session、工具、action、直接发言或恢复:阅读 ACP Session 运行时。
- 变更可见性、排序、并行收集、回放或重连:阅读信息同步。
- 变更 board/profile/Character 快照、Match 持久化或赛后流程:阅读 Match 生命周期。
- 变更轨迹、开发者模式、审计、采集或回放语料:阅读轨迹与仿真。
- 变更浏览器状态、投影切换、特效执行或终局渲染:阅读 Web 客户端。
