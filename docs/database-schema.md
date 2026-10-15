# 数据模型契约

状态：Phase 0 设计，尚无数据库或迁移。以总纲为基础，采用 ADR 0002/0003 的明确语义。

## 共用约束

稳定 UUID；统一 UTC 时间；外键每连接开启。具有工作区范围的表提供 `(workspace_id, id)` 唯一约束，需要跨表引用时使用复合外键或同事务显式校验，防止合法 ID 被跨工作区使用。删除先使用归档/软删除状态，永久删除另行定义依赖清理。

## Phase 1 最小表

| 表 | 核心字段及约束 |
| --- | --- |
| schema_migrations | version PK、checksum、applied_at |
| workspaces | id PK、name、created_at、updated_at |
| conversations | id PK、workspace_id FK、title、created_at、updated_at |
| messages | id PK、conversation_id FK、role CHECK、content、status CHECK、model_run_id nullable、created_at、updated_at |
| execution_runs | id PK、conversation_id FK、model_id、model_config_json、context_manifest_json、status、started_at、finished_at |
| execution_events | id PK、run_id FK、seq、kind、occurred_at、payload_json；UNIQUE(run_id, seq) |

`execution_runs.status` 是当前状态投影。`execution_events` 经应用接口只允许插入，并用数据库触发器拒绝常规更新/删除；其不可变保证面向应用使用，不声称能阻止拥有数据库文件的管理员修改。整工作区永久清理需要独立授权的维护路径与备份策略，在实现删除功能前定义。

消息与运行的关联通过插入顺序和事务处理，避免循环外键的初始化死锁。开始新运行先保存用户消息与 run，再追加事件。结束、取消、失败只能确定一个终态；中断启动恢复新增恢复事件，不伪造成功。每次重试创建新 run。

## Phase 2 知识修订

| 表 | 规则 |
| --- | --- |
| knowledge_nodes | id、workspace_id、kind、latest_version、effective_version nullable、revision、archived_at |
| knowledge_versions | node_id + version 复合 PK，标题/正文/作者/修改原因/时间不可变 |
| knowledge_approval_events | node_id、version、action、actor、created_at；记录确认、拒绝和撤销 |
| knowledge_edges | 稳定关系 ID、workspace_id、当前修订指针 |
| knowledge_edge_versions | edge_id + version PK、端点、relation、状态与修改原因 |
| graph_layouts | id、workspace_id、graph_kind、name、camera_json |
| knowledge_positions | layout_id + node_id PK、x/y/z |
| execution_positions | layout_id + event_id PK、x/y/z，与知识位置分表 |

节点状态按生效版本与审批记录计算，前端映射为待确认/已确认/有争议等明确文字。作者不能直接修改旧内容；恢复旧内容同样产生新版本。确认操作带 `expected_revision`，冲突时保留用户草稿并提示重新比较。

## Phase 4 来源与检索

授权来源、来源内容版本、分段、FTS5、证据关联及上下文快照在对应阶段建表。证据关联必须标识 node_id + node_version、source_version_id 及真实段落/行定位。哈希用于识别内容，不能替代可重放内容。

撤销授权阻止未来读取和检索；是否保留已导入内容、历史快照和引用由明确清理选项控制。备份/导出保持引用一致，恢复后执行外键和完整性检查。
