# Contracts package 指南

参见[根 AGENTS.md](../../AGENTS.md)。修改本包之前先阅读 [README.md](README.md);它持有包的职责、边界与变更契约。

保持跨边界 IDs 为 branded,并用其所属的 Zod schemas 解析 wire、配置、用户输入与持久化值。为变更的 contracts 添加 producer/consumer 覆盖。不要将规则、存储、server、asset 或浏览器行为移入本包。
