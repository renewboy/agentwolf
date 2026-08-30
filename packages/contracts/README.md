# Contracts package

`@agentwolf/contracts` 是 engine、assets、server 与 Web 客户端共享的 wire 与持久化词汇表。它包含 branded 标识符、Zod schemas 以及推导出的 TypeScript 类型。

## 职责

- Player、Match、board、Profile、Tool、Character、插件与运行时标识符。
- 结构化玩家动作与动作预期。
- 领域事件信封与可见性描述符。
- REST 与 WebSocket 请求/响应 DTOs。
- Settings、postgame、trajectory、simulation、Match 快照与只读 archive schemas。

每一个跨越 JSON、配置、数据库 JSON、进程或浏览器边界的值,都由其所属 schema 解析。同进程代码在该解析之后消费推导出的类型。

## 边界

Contracts 不包含规则求值、IO、assets、server 编排或浏览器行为。当一个类型被多个包作为稳定值交换时,它才属于这里;包私有状态仍留在其所属包内。

标识符在跨包边界时保持 branded。开放的插件标识符使用经过校验的 branded 字符串;封闭的协议 union 在消费方使用穷举 switch。

## 变更规则

- 在修改使用某个 schema 的 server 路由、Web 客户端、事件载荷、动作或持久快照之前,先新增或修改该 schema。
- 存储与 wire 变更在其归属方给出显式的兼容性或迁移处理。
- 保持 schemas 足够严格,以拒绝未知的用户/wire 输入,同时不要在已有类型的同进程调用内部添加冗余校验。
- 在 producer/consumer 边界添加契约测试;不要在 Markdown 中维护并行的字段目录。

[架构索引](../../docs/architecture.md)负责路由跨包设计。确切导出由 `src/index.ts` 与各源 schemas 定义。
