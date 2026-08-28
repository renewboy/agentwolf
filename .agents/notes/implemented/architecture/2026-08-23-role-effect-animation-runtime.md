# Agent Note: Role 特效动画运行时

Status: implemented

## Problem

Role 动作需要富有表现力的浏览器反馈,同时不能把确定性事件耦合到 DOM 细节、拖延游戏推进,
也不能让多个动画 runtime 建立互不兼容的时序与清理模型。

## Decision

AgentWolf 锁定 `gsap@3.15.0` 与 `@gsap/react@2.1.2`。所有 GSAP import 都经由 Web motion
adapter;Flip 是唯一额外注册的 plugin。

领域事件只包含游戏语义。经过 server 可见性过滤之后,呈现注册表投影语义化的 `RoleEffectCue`
值。assets 拥有效果元数据与时序;Web effect controller 拥有 DOM 选择与 timeline。完整、减弱与
关闭三种模式各自只消费每条 cue 一次,保持指针透明,把元素恢复到静息态,并且永不参与引擎
时序。

当前设计记录于 [Web 客户端架构](../../../../docs/architecture/web-client.md)
与[前端方向](../../../../docs/frontend.md)。

## Alternatives considered

**在游戏事件中渲染指令。** 这会让 replay 与游戏语义依赖特定的 UI runtime,并使呈现字段跨
projection 暴露。

**多个动画库。** 独立 runtime 会重复时序编排、减弱动效、清理与测试行为,同时增加 bundle
体积与归属歧义。

**纯 CSS 效果。** CSS 仍适合环境状态,但 Role 序列需要显式、可寻址的清理与有界组合,并归属
同一个 runtime owner。

## Consequences

Role 效果可以独立于规则与 replay 演进。新增主动效果需要语义 cue、可见性、asset 定义、
完整/减弱行为、清理与浏览器覆盖;被动 Role 显式声明其没有主动效果。
