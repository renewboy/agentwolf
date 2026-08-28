# Match 生命周期架构

## 职责

该模块拥有从可变配置目录到一份不可变 Match 的转换、持久 Match 记录、运行时创建与恢复、
暂停/继续/删除操作、终局结果与赛后复盘。

server 组合 contracts、game engine、assets、ACP Sessions、SQLite repositories 与实时投影。
游戏规则留在引擎内;配置呈现保持在领域事件之外。

## 目录与配置

Agent Tools 描述一个 ACP 命令、参数、环境变量 allowlist、初始模式与能力提示。Agent Profiles
将一个 Tool 绑定到所选已宣告模型、可选 reasoning 强度与非机密连接选项。Profiles 拥有一个
显式的持久化顺序。

board 目录将只读内置 boards 与 SQLite 自定义 boards 相结合。自定义 board 拥有 Role 数量、
sheriff 与胜负政策,以及可为空的逐 Seat Agent Profile 与 Character 默认值。被引用的 Profiles
或 Characters 不可删除。

Character 目录将资产支撑的内置项与可编辑的 SQLite 卡片以及托管的本地头像文件相结合。
Characters 只控制公开呈现与表达;它们从不改变游戏 Role、能力、推理质量、胜负或事件状态。

Match 创建按此顺序解析 Seat 取值:

1. 显式 Match 请求;
2. board Seat 默认值;
3. 首个有序 Agent Profile,或无 Character。

昵称保持为可编辑的 Match 身份,且在 trim 后必须唯一。跨 Seat 复用同一 Profile 或 Character
是合法的。

## 不可变配置快照

创建时将所选 board 存储为 schema-two 快照,包含其 Ruleset 锁与指纹、解析后的政策、Role
构成、修订号、Agent Profile 默认值、Character 默认值,以及不可变的逐 Seat Character 卡。它
同时快照全局发言长度偏好。

之后的目录编辑不改变既有 Match。领域事件日志不含任何可变目录引用,也不含 Character 卡数据。
上传的头像资产 ID 对历史快照保持稳定。

## 运行时与持久化

`MatchManager` 解析配置、创建或恢复确定性引擎,并拥有活跃 Match 运行时。`match-runtime`
协调引擎预期、ACP 玩家回合、动作 barrier、发言播报边界、实时快照与终局交接。

SQLite 在各自所属的 repository 中存储 Match 元数据、不可变配置、append-only 事件、送达台账、
Session 绑定、已接受动作、复盘状态与开发者记录。server 重启从事件重建引擎状态,并恢复持久
玩家 Session。

暂停的 Match 保留其事件状态,并暴露继续与删除动作。继续恢复同一阶段与 Sessions。删除关闭
运行时,移除所有数据库持有的 Match 记录,并只移除该 Match 在配置数据目录下的玩家 workspace。

## 赛后复盘

赛后复盘是确定性游戏事件日志之外的 server 编排。胜负 registry 返回明确的获胜 Player ID;
复盘冻结该集合作为 MVP 资格,并以其补集作为 SVP,不含具体 Role 或阵营分支。

对启用复盘的 Match,终局编排会在首个 ended 快照之前创建一个十秒倒计时。观战者可以在倒计时
期间立即开始或跳过;倒计时到期自动开始复盘,已开始的复盘不可跳过。

每个 Seat 保留其原始逻辑 ACP Session,并提交一份不可变评分表,包含 MVP 与 SVP 提名,加上为
其他每名玩家打出的五项整数评分。评分表在工具回执之前即已持久,并立即投影到浏览器,但绝不
进入其他复盘者的 Prompt。

全部评分表存在之后,聚合计算算术平均分,并按票数、精确得分总分、再到 Match 稳定的抽签顺序
确定奖项。原始评分表与聚合输出保持为独立的持久记录。

感想通过共享的直接发言与播报路径顺序执行。复盘恢复只续做原始 Session ID 上未完成的工作。
重复传输失败会暂停复盘;完成或跳过复盘会关闭 Session 并完成 Match 生命周期。

赛后记录与 `match_events` 保持分离。仿真采集排除复盘行与赛后轨迹回合,使已审查的游戏事件
fixture 保持 `match.ended` 作为其终局 oracle。
