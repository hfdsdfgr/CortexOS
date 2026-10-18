# CortexOS 产品方向与架构差距审计

日期：2026-10-18。审计基线：`70ea24c`。状态：代码静态核查完成；本轮未运行应用、模型或测试。历史测试成绩只代表既有阶段，见 [milestone-log.md](milestone-log.md)。本文路径相对仓库根目录，行号对应基线；函数名为持久定位依据。

## 结论

现有实现是可复用的本地认知工作台基础：真实聊天与运行记录、知识审核版本、数据库知识图均已接通。主要偏差是模块之间缺少“知识参与回答”的闭环、实体级导航和执行图投影。当前尚不能宣称具备完整项目记忆、检索增强、证据支持的决策或可复现实验能力。

原始目标见 `development.md` §1、§5、§7–8、§10。原计划把检索放在 Phase 4，执行图放在 Phase 3，因此这些缺口部分属于阶段性未交付，并非已有功能回退；但继续优先图规模和安装包会延迟产品核心价值验证。建议将最小知识参与上下文前移到 P0，保留现有阶段历史，不追认产品闭环完成。

## 七项核查

| 问题 | 核查结论 | 代码依据 |
| --- | --- | --- |
| 1. 工作区及实体 ID 是否统一？ | 数据层基本统一，交互状态部分分散。消息、运行、知识和关系使用稳定 ID；真实图直接使用知识 ID，并无独立复制的图节点。工作区由 `useStudio` 共享。知识选中、图选中、运行选中却分别存于不同组件。 | `models.rs:148` 附近 `new_id()` 使用 UUID；`0001_initial.sql` 工作区复合外键；`0002_knowledge.sql` 来源消息复合外键；`0003_graph.sql` 关系端点工作区约束。前端 `studio.ts:117`、`App.tsx:44`、`Graph.tsx:140`、`Chat.tsx:143`。上述后端文件在 `apps/desktop/src-tauri/`，前端在 `apps/desktop/src/`。 |
| 2. 图来自数据库还是演示？ | 两种来源明确分开。原生桌面默认真实工作区；浏览器默认演示。真实图含数据库节点、关系历史、位置和相机。7 节点演示仅在内存，使用 `demo-*` ID。 | `apps/desktop/src/Graph.tsx:55`、`:87` 数据选择，`:169` 调用 `load_knowledge_graph`；`apps/desktop/src-tauri/src/graph.rs:81` 按工作区查询；`apps/desktop/src/graph-data.ts:84` `demoGraph`。 |
| 3. Run、Step、Snapshot 是否存在？ | `execution_runs` 已有，Rust 对应 `RunSummary/RunDetail/PreparedRun`，并无名为 ExecutionRun 的类型。`execution_steps`/ExecutionStep 和 `context_snapshots`/ContextSnapshot 尚无实现。已有不可变 `execution_events` 和 JSON manifest，可作为步骤投影基础。 | `apps/desktop/src-tauri/migrations/0001_initial.sql:8`、`:30`；`apps/desktop/src-tauri/src/models.rs:81` 起；`db.rs:406` manifest。对 src、Rust src、全部迁移检索上述缺失名称无匹配。 |
| 4. 聊天能追到实际依据吗？ | 能从消息追到 run、保存的生成参数、消息 ID/哈希、系统提示版本/哈希及事件。不能追到实际使用的知识/外部证据，因为调用没有使用它们。没有完整输入快照、模型权重 digest 或请求版本记录；UI 仅列消息定位符，不能精确跳转消息。 | `db.rs:339` `prepare_run` 只读取会话历史，`:406` 保存 manifest；`:522` `run_detail` 先校验工作区；`ollama.rs` 的 `chat()` 构造实际请求；`Chat.tsx:541` `RunDrawer`。 |
| 5. 审核修改能否影响后续回答？ | 不能。审批原子推进 `effective_version`，但 `prepare_run` 未读知识表。新草案保留旧生效版的语义已实现，尚未接入上下文选择或检索。 | `knowledge.rs:207` `approve_knowledge`；`db.rs:339–466`；manifest 明确 `retrievalUsed:false`。FTS5 编译能力检查存在于 `db.rs:93`，迁移没有 FTS 索引表，不能据此算检索已实现。 |
| 6. 两类图是否区分？ | 数据语义正确分开；知识图已实现，执行图只有明确占位。执行时间线真实可用，未伪装内部思考。布局表仅允许 knowledge，不能直接保存执行视角。 | `Graph.tsx:107` 执行占位；`Chat.tsx:644` 时间线；`0003_graph.sql` 的 `graph_kind='knowledge'`；`0001_initial.sql` 事件独立表。 |
| 7. 完成程度？ | 见下表；现有“阶段验收通过”不等于完整认知闭环交付。 | 实现、迁移、测试源码及历史里程碑交叉核对。 |

## 能力状态清单

| 状态 | 能力 | 依据与边界 |
| --- | --- | --- |
| 已实现（现有切片） | 本地模型健康检测、流式回答、取消、失败与重启恢复、单生成约束 | `commands.rs::start_chat/generate`，`ollama.rs::chat`，`db.rs::finish/recover_interrupted`；测试 `tests/chat.spec.ts`、`tests/ollama.spec.ts`。本轮未复跑。 |
| 已实现（现有切片） | 工作区/会话/消息持久化及最小运行审计 | `0001_initial.sql` 不可变事件触发器；`db.rs` 单终态事务；运行状态行可更新，事件行只追加。 |
| 已实现（现有切片） | 回答摘录→草案→审批→新版本；关系修改/停用留史；知识图编辑与视角保存 | `knowledge.rs::save_knowledge/approve_knowledge`，`graph.rs::save_knowledge_edge/save_graph_view`；`tests/knowledge.spec.ts`、`tests/graph.spec.ts`。 |
| 部分实现 | 记忆与上下文管理 | 仅同一会话最近完整轮次；UTF-8 字节保守预算，非精确 token 预算；没有跨会话长期记忆选择、知识排序或预算排除原因明细。 |
| 部分实现 | 来源与证据 | 节点保存起源回答、摘录和完整回答哈希；支持打开原会话。没有外部来源实体、版本级多来源、片段偏移或回答引用验证。`kind=evidence` 只是知识分类。 |
| 部分实现 | 版本比较与决策 | KnowledgeInspector 可浏览版本/审批历史，知识类型包含 decision/conflict。没有专门决策方案、证据对照、结构化 diff、固定问题重跑与评估比较。 |
| 仅 UI 占位 | 3D Execution Trace | `Graph.tsx` 提示下一阶段接入，链接只回聊天页，没有运行定位。 |
| 尚未实现 | ContextSnapshot、知识检索、授权文件导入、引用闭环、邻域按需展开、统一实体导航 | 源码调用链、全部三份迁移和命令注册未发现相应功能。已有全图邻边展示不能等同分页邻域查询。 |
| 尚未实现 | Decision Lab、工作流规则版本、真实工具/验证执行、固定评估集、模型比较、LoRA | 原总纲后期范围；当前没有对应存储、执行器或操作界面。 |

## 需优先纠正的语义风险

1. **调用尝试与调用成功混淆。** `commands.rs::generate` 先写 `model_called`，后调用 `Ollama::chat`；后者先 `/api/show` 再 `/api/chat`。模型检查失败也会有该事件。旧事件应解释为“开始本地模型调用尝试”，新协议分开记录检查、发送尝试、响应接收；禁止改写旧事件。
2. **上下文准备时间不等于测量耗时。** `prepare_run` 在组装之后才于同一事务中写接收/准备事件；两者时间差不代表实际组装成本。现阶段只展示记录时间，精确阶段耗时由后续真实边界埋点提供。
3. **已确认不是客观验证。** 用户可确认 hypothesis 或无来源知识；检索资格需同时考虑生效版本、类型与使用政策。默认生产上下文使用已确认 knowledge/context/decision，假设与冲突需显式选择并携带类型。该默认值是待确认方案。
4. **图显示最新草案，回答应使用生效版本。** `graph.rs:93` JOIN latest_version；这对编辑合理，但不能用图当前标题/正文代替历史运行实际输入。详情同时标识最新草案 vN 与生效 vM。
5. **关系历史未固定端点知识版本。** 关系修订引用节点 ID 而非内容版本；节点内容修改后关系有效性未自动复核。实验必须另行固定端点版本，当前关系历史不等于当时证据快照。
6. **源摘录是起源，不是所有修订的证明。** `knowledge.rs:177` 起验证摘录确属原回答，哈希针对完整回答；`Knowledge.tsx:382` 已提示起源含义。后来用户修订没有独立证据链接，应保留这一区分。
7. **参数记录仍不足以精确重放。** 保存了 ModelSettings，但 `think=false`、keep_alive、system 正文及模型 digest 没有完整随 run 固定。相同模型标签可能改变；即使输入固定也不保证生成逐字相同。
8. **产品入口仍偏聊天。** `App.tsx` 顶栏文案为“本地对话 Alpha”，跨页只识别四个页面 hash。调整产品文案应与闭环交付同步，不能仅改名称掩盖缺失能力。

## 可复用资产与检查范围

复用 SQLite 事务/迁移备份、工作区边界、Ollama provider、流状态机、运行记录、知识编辑/审批/并发保护、共享 KnowledgeInspector、R3F 画布控制和降级列表、语义 CSS。优先增加明确的适配器与命令；保留单应用结构。

已检查：`development.md`、规范/计划、三份 SQL 迁移、`models/db/commands/ollama/knowledge/graph.rs`、`App/studio/Chat/Knowledge/Graph/GraphViewport/graph-data` 和现有测试入口。此审计依据仓库实现，未读取用户运行数据库，未统计用户已有记录，未复核原生 UI 或真实性能。详细方案见 [cognitive-architecture-v2.md](cognitive-architecture-v2.md)、[graph-experience-v2.md](graph-experience-v2.md)、[refactoring-plan.md](refactoring-plan.md)。
