# Agent Note: 统一产品覆盖率与模块化浏览器测试

Status: implemented

## Problem

聚合覆盖率会让测试良好的模块隐藏未经测试的生产文件,而一个遗漏 Web 客户端的测试门禁无法
强制执行全仓库统一的质量标准。浏览器场景还需要显式的领域归属与资源隔离,以保持可独立选择
并可以安全并行运行。

## Decision

Node 与 Web 测试是同一份 Vitest 配置下的 projects。统一覆盖率门禁度量 `packages/*/src`、
`apps/server/src` 与 `apps/web/src` 下的产品运行时源码,并对每个纳入文件强制 80% 的
statements、branches、functions 与 lines。

覆盖率只排除无行为的 package barrel、CLI 与浏览器 launcher、错误声明,以及 Web GSAP 转发
边界。报告使用 50% 与 80% 水位线,并输出终端、JSON summary 与 HTML。

## Web test layer

Web 测试在 jsdom 中运行,使用 React Testing Library、user-event 与 jest-dom。它们拥有 API
transport、纯呈现逻辑、可复用的键盘与焦点交互、hooks、页面状态与组件行为。Playwright 拥有
真实浏览器布局、滚动、WebSocket 代理、语音播放集成与动画清理。

Node、Web 与 E2E 测试源码共享仓库测试 TypeScript 配置。聚焦 Web 命令可用,且不把 Web 测试
从统一仓库门禁中移除。

## E2E ownership and isolation

Playwright 规范按产品领域拆分。并行 Chromium worker 使用唯一运行时命名空间和一份共享资源
fixture,按依赖顺序删除 Match、board、Character、Profile 与 Tool。Settings 与 Profile 顺序场景
运行在一个依赖型串行 project 中,使全局状态永远不会与并行模块竞争。

Match DTO、语音、实时连接、UI 与资源 helper 位于 `e2e/fixtures`。E2E server 使用内存数据库,
架构检查对每个规范强制 500 行上限。

## Consequences

强的模块无法隐藏未经测试的生产文件。前端逻辑与 server 及 package 代码参与同一套覆盖率与类型
门禁。浏览器场景保持可独立选择,而全局变更拥有显式调度而非文件顺序依赖。

覆盖率的提升必须来自自有行为与边界用例。新增排除项与覆盖率 ignore 指令不是满足门禁的公认
方式。

## Alternatives considered

**仅聚合阈值。** 这不能让每个生产文件担责,并允许在通过的模块总数中隐藏红黄文件。

**由 Playwright 驱动的 Web 源码覆盖率。** 这会把单元门禁耦合到 dev server 与 source-map 采集,
同时鼓励为本地组件与 hook 分支编写缓慢的浏览器场景。

**共享可变状态的物理 E2E 拆分。** 没有 worker 命名空间、按依赖顺序清理与全局变更串行化的
独立文件名,仍然保留顺序依赖。
