# 轨迹与仿真架构

## 职责

该模块记录每一次 ACP 回合用于审计,暴露 secret-safe 的开发者检查,验证语义送达边界,并将
已审查的真实 Match 行为转化为确定性离线回归 fixture。

轨迹是游戏事件日志之外的诊断状态。仿真 fixture 是紧凑的已审查 oracle,不是生产数据库的副本
或原始模型对话。

## 轨迹模型

一个轨迹 Turn 以一次送达尝试开始,拥有其 Match、玩家、持久 Session 代、阶段、动作类型、
已确认事件范围、尝试次数、时序、结果与上下文用量。其中的稳定 Record 表示 Prompt、reasoning、
message、tool、permission、已接受动作、usage、诊断、生命周期与错误数据。

流记录按协议通道与 ID 合并;工具状态按 tool-call ID 合并。文本 delta 按协议顺序追加,不做
基于内容的去重。发言记录通过与引擎相同的规范规范化进行投影。

secret 键字段、凭据、ACP 元数据、环境素材与连接值在持久化之前移除。有界内容记录一个明确的
截断标记。

## 读取与审计面

轨迹采集在每种启动模式下都处于活跃状态。导航、HTTP、WebSocket、配置与逐 Match 读取动作仅
在 server 以回环开发者模式启动时存在。

单调递增的轨迹修订号支持追平与实时 upsert。读取先分页 Turn,只为被引用的 Turn ID 加载
Record。当 Match 没有轨迹订阅者时,持久化跳过实时 delta 规范化。

玩家诊断将不可变的非机密 Session 启动快照与当前送达及用量状态组合。Web 检查器将玩家诊断与
单个 Record 详情保持为分离的模式。

审计服务在每个 Turn 的 `toSequence` 处重建引擎,并检查 Prompt 基数、visibility-safe 范围、
行为者/动作边界、送达归属、确认、续篇、已接受动作对账与引导上下文预算。它从不将历史 Prompt
文本与当前模板比对。

## 仿真采集

轨迹 Turn 已落定的已结束或已暂停 Match 可以生成候选采集。采集读取不可变 board、发言上限、
事件日志、规范化 Turns、已接受动作、完成顺序、送达结果与相关播报控制。

规范化替换 Match、board、Profile、Session、送达、名称、时间与路径标识符。原始 Prompt、
reasoning、工具输出、凭据、诊断、运行时路径、赛后行与赛后 Turn 不进入已提交 fixture。本地
候选来源只保留源 Match 身份与采集时间。

候选存放于 `.agentwolf/simulations/inbox`,携带完整事件轨迹供审查。批准是非覆盖式的,在
server 测试语料下写入一份紧凑的版本化 fixture,包含决策、结构化上下文、已审查事件顺序、
语义摘要与终局检查点。

CLI 与浏览器审查调用同一个 `simulation-workflow` 服务进行加载、规范化、校验、警告确认与
批准。浏览器路由接受仓库持有的候选 ID,而不是无约束的路径。

## 确定性 runner

引擎 runner 创建一个全新规则引擎并重新提交采集的决策。编排 runner 通过生产 Match 运行时与
Action Mailbox,使用内存持久化与确定性 fake Sessions。

顺序重放在提供该玩家的下一条已记录动作之前,先向当前引擎询问活跃行为者。并行重放要求完整
的已采集行为者 barrier,并保留已记录的完成顺序。两个 runner 都校验已审查的事件 oracle;
编排 runner 额外检查 Prompt 边界、确认、恢复、重启重建与播报结果。

一个稳定的 fixture 与变体种子标识每次运行。重复同一 fixture 与变体必须产生相同的规范输出。
