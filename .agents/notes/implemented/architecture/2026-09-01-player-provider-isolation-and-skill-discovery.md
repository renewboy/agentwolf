# Agent Note: 玩家 Provider 隔离与 Skill 发现

Status: implemented

## Problem

ACP Provider 对主指令、Skill 发现、配置目录、MCP 注入、权限与 Session 恢复使用不同机制。把这些
差异压入一份通用启动参数拼接流程,会让某个 Provider 的宿主设置、项目指令、记忆、Skills 或开发
工具进入玩家上下文,也无法证明模型实际获得了同一局内能力边界。

狼人杀玩家同时需要稳定的生命周期与行动契约,以及可按需调用的策略知识。把两类内容合并进
foundation 或同一个 Skill,会扩大每回合上下文并混淆主指令、操作契约与策略知识的生命周期。

## Decision

`PlayerProviderRegistry` 是玩家 Provider 的选择边界。它先按精确 Agent Tool ID,再按 Tool kind
解析 `PlayerProviderAdapter`;未注册经过验证 adapter 的 Tool 在创建玩家 Session 前失败。每个
adapter 完整拥有四类 policy：

- workspace policy 决定玩家运行目录、Skill 发现入口与清理生命周期；
- state policy 准备 Match-owned Provider home,只引用允许的宿主登录凭据；
- launch policy 关闭宿主记忆、项目规则、IDE、网络、写入、协作与无关开发能力；
- Session policy 声明 MCP 传输、可见工具、resume 验证、permission 与主指令 metadata。

server 为每个 Seat 渲染 foundation,并在首次 `session/new` 前将其固化为不可变主指令。adapter
通过 Provider 支持的主指令机制装配该文本,并把实际生效的文本返回给 trajectory。bootstrap Turn
以独立 instructions Record 保存完整系统提示词；bootstrap Prompt 仅负责确认 Session 已理解身份与
规则,后续行动继续使用同一逻辑 Session,不重复 foundation。

`agentwolf-player` 与 `werewolf-strategy` 是两个独立 Skill。foundation 按名称声明并提示使用它们；
各 Provider 使用自身原生的 workspace 或 project Skill discovery 按需加载内容。玩家环境只暴露
这两个 Skill、只读本地知识工具和当前声明的 AgentWolf 动作工具。

精确 Prompt 生命周期定义于
[插件持有的 Prompt bundles](2026-08-25-plugin-owned-prompt-bundles.md),Session 身份与恢复定义于
[持久玩家 ACP Sessions](2026-08-24-durable-player-acp-sessions.md),运行时边界定义于
[Prompt 与玩家上下文](../../../../docs/architecture/prompt-and-context.md)与
[ACP Session 运行时](../../../../docs/architecture/acp-session-runtime.md)。

## Alternatives considered

**在通用启动函数中按 Provider 编写条件分支。** Provider 差异涉及 workspace、状态、进程和
Session 四个生命周期,集中分支无法形成完整注册契约,也容易在新增 Tool 时继承未验证的默认行为。

**把 foundation 作为 Skill 入口。** foundation 是每个 Seat 在 Session 建立前生效的不可变主指令；
Skill 是模型按名称发现并按需加载的知识。两者具有不同的加载时机与所有权。

**把策略内容复制进 foundation 或玩家操作 Skill。** 策略知识会常驻每个回合上下文,并使生命周期、
动作边界与游戏策略无法独立演进。

**在 foundation 中指示模型按文件路径查找 Skill。** 文件路径把 Provider 的发现实现暴露给模型,
绕过原生 Skill 机制,并使 launch workspace 与目录布局成为 Prompt 契约。

**仅依赖工具名称过滤。** 工具白名单不能关闭宿主设置、祖先项目指令、ambient Skills、Provider
记忆或状态目录,因而不能单独证明玩家隔离。

## Consequences

- 新 ACP Provider 必须注册完整 adapter,并分别证明 workspace、state、launch 与 Session policy；
  未验证的 Provider 没有玩家模式默认值。
- foundation、bootstrap、玩家操作 Skill 与策略 Skill 可以独立修改,不会互相伪装成另一种加载机制。
- Match 删除统一清理玩家 workspace、Provider home 与隔离 launch workspace；宿主凭据保持引用关系,
  不复制进仓库或对局记录。
- Provider CLI 的配置语义发生变化时,必须重新验证模型实际可见的主指令、Skills、工具、禁止能力与
  同 ID resume,不能只检查生成的启动参数。

## Verification

Registry 与 adapter 测试验证精确 Tool 优先级、重复注册拒绝、未知 Tool 失败关闭、四类 policy 装配、
主指令固化和隔离目录清理。每个内置 Provider 的 live smoke 验证模型实际按名称发现两个 Skill、
只能看到允许工具、能够提交正式动作,并以相同 Session ID 恢复；外部账号或组织拒绝单独报告为
Provider 服务失败。
