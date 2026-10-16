# 数据模型契约

状态：Phase 1、2A 知识与 2B 关系/布局迁移已实现；检索表仍为设计。采用 ADR 0002/0003 的明确语义。SQL 以 `apps/desktop/src-tauri/migrations/` 中 0001、0002 和 0003 为准。

## 共用约束

稳定 UUID；统一 UTC 时间；外键每连接开启。具有工作区范围的表提供 `(workspace_id, id)` 唯一约束，需要跨表引用时使用复合外键或同事务显式校验，防止合法 ID 被跨工作区使用。删除先使用归档/软删除状态，永久删除另行定义依赖清理。

## Phase 1 最小表

| 表 | 核心字段及约束 |
| --- | --- |
| schema_migrations | version PK、checksum、applied_at |
| workspaces | id PK、name、created_at、updated_at |
| conversations | id PK、workspace_id FK、title、created_at、updated_at |
| messages | id PK、workspace_id、conversation_id、seq、role CHECK、content、status CHECK、model_run_id NOT NULL、created_at、updated_at；UNIQUE(conversation_id,seq) |
| execution_runs | id PK、workspace_id、conversation_id、assistant_message_id、model_id、model_config_json、context_manifest_json、status CHECK、error_message、started_at、finished_at |
| execution_events | id PK、run_id FK、seq、kind、occurred_at、payload_json；UNIQUE(run_id, seq) |
| app_settings | key PK、value_json；保存已校验模型参数 |

`execution_runs.status` 是当前状态投影。`execution_events` 经应用接口只允许插入，并用数据库触发器拒绝常规更新/删除；其不可变保证面向应用使用，不声称能阻止拥有数据库文件的管理员修改。整工作区永久清理需要独立授权的维护路径与备份策略，在实现删除功能前定义。

运行指向回答消息的复合外键为 `DEFERRABLE INITIALLY DEFERRED`；消息指向运行使用同工作区、同会话复合外键。在同一事务内依次创建运行、用户消息、回答占位及事件，提交时校验完整关系。唯一部分索引限制全库只有一个 running。结束更新带 `WHERE status='running'`，迟到终态与检查点不会覆盖已结束内容。每次重试创建新 run。

当前数据库文件为应用数据目录下的 `cortexos.sqlite3`。连接启用外键、WAL、FULL 同步及 3 秒 busy timeout；启动检查 SQLite FTS5 编译能力。迁移版本与 SHA-256 校验不匹配时显示错误并保留数据，不自动重建。Windows 用独占 `cortexos.lock` 句柄保护打开和恢复，锁随进程退出释放。强制中断可能损失最后 250 ms 以来尚未提交的片段，不能保证未落盘字节恢复。

模型完成帧的 `done_reason` 与实际 token/耗时统计保存在 `response_completed` 事件 payload。接口中的消息 `finishReason` 从该事件投影读取；`length` 在界面显示达到输出上限，该轮不用于后续上下文。运行 completed 表示响应流结束，不自动宣称回答内容完整或正确。

## Phase 2 知识修订

| 表 | 规则 |
| --- | --- |
| knowledge_nodes | id、workspace_id、kind、latest_version、effective_version nullable、revision；归档后续实现 |
| knowledge_versions | node_id + version 复合 PK，标题/正文/作者/修改原因/时间不可变 |
| knowledge_approval_events | node_id、version、actor、created_at；2A 仅记录确认，拒绝与撤销后续实现 |
| knowledge_edges | 稳定关系 ID、workspace_id、当前修订指针 |
| knowledge_edge_versions | edge_id + version PK、端点、relation、状态与修改原因 |
| graph_layouts | id、workspace_id、graph_kind、name、camera_json |
| knowledge_positions | layout_id + node_id PK、x/y/z |
| execution_positions | layout_id + event_id PK、x/y/z，与知识位置分表 |

节点状态按生效版本与审批记录计算，前端映射为待确认/已确认/有争议等明确文字。作者不能直接修改旧内容；恢复旧内容同样产生新版本。确认操作带 `expected_revision`，冲突时保留用户草稿并提示重新比较。

## Phase 4 来源与检索

授权来源、来源内容版本、分段、FTS5、证据关联及上下文快照在对应阶段建表。证据关联必须标识 node_id + node_version、source_version_id 及真实段落/行定位。哈希用于识别内容，不能替代可重放内容。

撤销授权阻止未来读取和检索；是否保留已导入内容、历史快照和引用由明确清理选项控制。备份/导出保持引用一致，恢复后执行外键和完整性检查。


### Phase 2A 实施契约

迁移 0002 创建 knowledge_nodes、knowledge_versions、knowledge_approval_events。节点保存工作区、latest_version、effective_version（可空）、revision、更新时间，以及可空的原回答 conversation/message 引用、原文摘录和后端计算的消息 SHA-256。来源是创建时不可变的起源记录，不代表修改后内容已经被原文证实。创建时验证原回答属于同一工作区、角色 assistant、已结束且摘录是原文的连续子串。手动创建没有回答来源。

版本包含标题、类型（context/knowledge/hypothesis/decision/evidence/conflict）、正文、作者 user、修改原因和时间；每次保存新增版本，旧版本用触发器禁止更新/删除。确认事件记录版本、user、时间，不改变版本内容。确认仅允许最新版本，事务内检查 expected_revision 并更新 effective_version/revision。新草案保持原 effective_version。来源引用、节点指针使用外键（版本指针延迟检查），拒绝跨工作区来源。

迁移器检查全部已应用版本的顺序和 checksum，旧库升级前用 VACUUM INTO 生成同目录唯一的迁移前备份；备份失败则停止升级。迁移在事务中完成。2A 不实现删除、撤销确认、关系或自动知识检索；确认代表用户审核，不代表事实验证。


### Phase 2B 实施契约

0003 迁移新增 knowledge_edges（稳定 id/workspace_id/latest_version）与 knowledge_edge_versions（edge_id/version/workspace_id/from_node_id/to_node_id/relation/active/change_reason/created_at）。关系版本不可修改/删除；端点以复合外键限制同工作区。关系保存需预期版本、同工作区两端点、有效关系类型、非自环和非重复有效关系。停用追加 active=false 修订，历史保留。方向按“起点 relation 终点”阅读；关系关联稳定节点，节点内容更新不自动构成关系重新审核。

graph_layouts 每个工作区一份 knowledge 视图，含 revision、camera/target 与更新时间；knowledge_positions 按 workspace_id/node_id 保存有限坐标。保存需预期视图 revision，防止两个页面覆盖；位置和视角保存不改变知识/关系版本。演示图仅在前端内存中，显式标记，不能保存为工作区内容。迁移沿用升级前一致性备份。首批仅验收小图，不预先实现动态力导向布局。
