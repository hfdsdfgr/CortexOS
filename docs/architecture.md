# 架构与边界

Phase 1，2026-10-15。技术方向沿用总纲，决定见 `ADR`。

## 当前实现

```text
Tauri 主窗口（WebView2）
  └─ React UI / useStudio
       ├─ 工作区 / 会话 / 对话 / 设置 / 执行详情
       ├─ typed invoke + run-scoped Channel
       └─ 知识与图谱空态
Rust commands
  ├─ spawn_blocking → rusqlite / SQLite WAL
  ├─ reqwest → 127.0.0.1:11434 / Ollama
  └─ 单生成任务 / 取消 / 超时 / 追加执行事件
```

Rust 暴露 11 个列明权限的业务命令。前端只通过 Tauri IPC 请求服务，不直接操作 SQLite 或连接模型 HTTP；没有通用 shell、文件或 URL 代理。数据由应用管理的本地目录保存，设置页显示实际路径。

使用原生 Hash 导航保留页面路径和浏览器返回；页面切换后聚焦主内容。不引入路由库或全局状态库。图类型选择使用原生单选按钮，支持键盘。占位选择在离开页面后重置，不承诺尚不存在的数据持久化。

## Phase 1 服务边界

```text
React UI
  │ 明确的 commands / run-scoped stream events
Rust commands
  ├─ workspace / conversation services → rusqlite → SQLite
  ├─ provider service → reqwest → 127.0.0.1:11434
  └─ trace service → append-only execution_events
```

UI 负责呈现和交互；Rust 负责校验工作区、权限、运行生命周期、网络请求及数据事务。数据库阻塞任务不在 UI 线程或网络异步任务中执行；每个生成任务的会话与运行标识固定，切换页面不改变归属。

共享状态集中在应用根部的 `useStudio`，通过属性传递给四页；当前无需额外状态库。会话正文、模型设置和事件保存在 SQLite；localStorage 仅保存上次选中的工作区与会话。输入草稿在窗口内按工作区和会话隔离，关闭窗口不保留未发送草稿。

`start_chat` 先在事务中保存用户消息、回答占位、运行和上下文清单，再返回 run。异步流通过 Channel 传递工作区、会话、运行、消息 ID 与递增序号。前端仅合并到相应消息；切换工作区不改变正在生成的归属。重新加载页面可从 SQLite 与当前运行恢复显示。

输出每 250 ms 在有新内容时写检查点，结束在事务中保存完整内容与唯一终态。取消关闭 HTTP 请求；超时与畸形流保留已收到的内容。正常关闭窗口先请求取消并等待保存；强制退出后，下次打开追加中断事件。Windows 独占数据目录锁防止第二个进程错误恢复尚在生成的运行。

上下文使用最近最多 10 个完整成功轮次与当前问题；按 UTF-8 字节保守预算，整轮纳入，超长当前问题在写入前拒绝。清单包含消息 ID、内容哈希及系统提示版本；没有文件检索或知识注入。实际模型 token 使用量以完成帧为准。详细选择见 ADR 0004。

先完成单模型供应方、单活动生成任务和直接调用，不提前设计插件容器或服务框架。所有网络与 SQLite 错误经 Rust 转换为不含正文的可恢复提示。

## 数据与可视化

- 知识图使用知识版本、来源与关系修订。
- 执行图从实际执行事件生成，投影可重建，历史事件不覆盖。
- 视角与位置独立保存，不触发知识修订。
- 未来研究数据独立存储和导航，不与前两类图混合。
- 图谱页和知识页复用同一详情/编辑逻辑；先让二维流程可用，再连接 3D。

## 构建约束

单应用位于 `apps/desktop`。npm 固定直接依赖版本，package-lock 锁定传递依赖；Cargo.lock 锁定 Rust 依赖。根目录工具链文件选择 MSVC，不设置全局默认。依赖安装、开发服务和构建均从应用目录运行。

Vite 仅监听 `127.0.0.1:1420`，固定端口并限制文件服务范围；项目 token 在应用根目录之外，不通过静态目录提供。桌面生产 CSP 不允许远程脚本/字体和外部模型连接。Phase 1 的 Ollama 请求由 Rust 完成，无需放开浏览器模型连接。

参考：[Tauri 前端配置](https://v2.tauri.app/start/frontend/)、[Vite 配置](https://v2.tauri.app/start/frontend/vite/)、[Tauri capabilities](https://v2.tauri.app/security/capabilities/)。


## Phase 2A 知识切片

Knowledge.tsx 包含工作区列表/详情与聚焦编辑器，通过四个类型化命令访问 knowledge.rs。编辑器由应用根部持有请求及固定工作区，原生 dialog 阻止背景导航操作；浏览器历史跳转不会卸载编辑器。知识详情按工作区与选中对象读取，迟到读取结果在卸载后丢弃。保存及确认均由后端 transaction + revision 检查实现，冲突比较必须由用户选择后才更新预期 revision。

知识节点的起源、不可变版本和审批事件分开保存；最新草案与生效版本有独立指针。0002 迁移前一致性备份，已应用迁移逐项核验。未引入新依赖。关系与图谱仍属于 Phase 2B。


## Phase 2B 图谱

Graph.tsx 管理筛选、选中节点、关系修订与布局草稿；GraphViewport.tsx 按需加载 Three.js / React Three Fiber / Drei，使用 demand 帧循环与 1–1.5 DPR，初始布局为确定性坐标函数。现阶段没有动态力导向计算，因此无需 Worker；后续动态布局与大图基准在 Phase 3 决定。

KnowledgeInspector 与 KnowledgeEditor 在知识页和图谱中共享，图谱编辑保存后返回原图谱。关系编辑器由 App 根部持有固定工作区，避免背景导航卸载未保存编辑；与知识编辑同样提供取消/正常关窗保护及并发比较。节点和关系的历史存储与视图存储分开；graph_layouts 与 knowledge_positions 的修订不会写入知识版本。

标签仅为选中节点及相邻节点（最多 7 项），通过受控 DOM 层按相机投影更新，避免跨 React root 的标签卸载冲突。无持续旋转、粒子、后处理或外部贴图。场景卸载时释放 WebGL 对象、控件、标签与监听。遇到 WebGL 创建失败或 contextlost 时保留节点索引与详情编辑。


## P0-A 上下文闭环增量

prepare_context_run 复用既有组装函数，同时服务 preview_context 和 start_chat。生效知识解析与快照提交持有同一 DB mutex，避免审批竞争；短事务保存整笔输入/快照，网络在释放锁后执行。Ollama::chat 接收 PreparedRun.request，而不再自行组装请求。get_run 同时读取快照，RunDrawer 可查看本次版本与实际 messages。

外部事件分为 model_inspection_started/completed、model_request_started、model_response_received 和原终态；legacy model_called 只表示旧调用尝试。详细权衡见 ADR 0006。保留 P0-B 的执行投影和统一导航任务。


## P0-B 执行图与实体导航

`execution.rs` 读取工作区限定的 RunDetail、输出和视角；`execution-data.ts` 将不可变事件、实际请求消息及知识引用投影为展示节点。`ExecutionTrace.tsx` 复用 `GraphViewport.tsx`，运行中每秒刷新，终态停止。事件顺序边、上下文纳入边、输出保存边各有独立解释；历史缺失快照保留缺失状态。

`navigation.ts` 用 URL hash 保存 workspace/conversation/run/node/version/message/event/mode 及返回执行图位置。App 验证工作区并加载会话；知识检查器读取精确版本；Chat 滚动并聚焦消息。异步结果按当前运行清理，工作区切换清除旧定位。详情正文不进入 URL。知识图和执行图共享渲染器及导航，使用独立事实来源和视角存储。见 ADR 0007。

## P1-A 生效知识检索

retrieval.rs维护CJK双字词/拉丁词索引、工作区限定搜索和持久化会话开关。db.prepare_context_run统一完成手动选择→自动候选与预算→历史消息→精确请求快照；preview_context复用同一逻辑但不持久化。approve_knowledge在同一事务刷新索引。候选记录、快照和真实查询边界与运行原子提交，细节见ADR0008。

前端studio读取Conversation.autoRetrieval并保存会话偏好；ChatComposer提供开关，RetrievalSummary复用于预览、CognitiveInspector和执行图的检索完成节点。图的新增事件来自保存事实，历史运行不会补造检索。


## P1-B1来源证据闭环

知识页通过工作区命令调用Rust原生文件选择器；短期预览票据绑定工作区，确认后原子保存source_documents/source_versions和来源事件。UI读取数据库快照并指定行范围，KnowledgeEditor复用原保存/审核事务，新增版本证据链接；后续修改继承起源。FTS、手动选择和审核均校验来源启用状态。请求快照的知识引用增加sourceEvidence（来源ID/版本/行/摘录/文本哈希），不伪造文件检索、工具或验证事件。来源不属于一级导航，仍从知识任务进入。回答引用解析是后续P1-B2。

## P1-B2 回答引用

上下文组装在实际选中的知识上分配 citationId，连同格式说明参与同一请求和字节容量计算。Rust citations.rs 仅解析 `[资料N]` / `[资料N:a-b]`，从该运行固定 manifest 解析编号及知识 content 行范围，保存 UTF-16 输出位置。finish 共用事务追加 citations_checked、回答与终态，启动恢复也走相同路径。load_messages 直接读取事件，不读取最新知识来重建历史引用；无本协议的旧运行不回填。

AnswerContent 将保存位置投影为文字按钮，CitationDetail 使用保存的全文和固定行高亮。来源起源单独展开，文件查看沿用 get_source 的工作区/版本限制；停用后仍可读旧版本。知识导航携带原回答地址，返回时恢复消息焦点。事件和执行图均只称“检查引用位置”，不推断事实、论断支持关系或隐藏思维。没有新增前端文件能力或模型接口。见 ADR0010。

## P1-C1 关联范围与会话浏览状态

graph-data.relatedNodeIds 从已加载工作区数据计算当前有效的一跳关系，按节点顺序去重。Graph 的范围、筛选和临时显示只决定画布/列表投影；50项显示分页不修改域数据，也不是数据库邻域分页。sessionBrowse 复用执行视图已有的进程内Map模式，按工作区/演示分别保留搜索、筛选、中心与展开量，实体选择仍以导航ID为准。位置与相机保持原保存命令和并发控制。GraphViewport从canvas继承的Tokens读取颜色，保持用户主题；绘制计数仅为真实渲染观察，不生成执行事件。见ADR0011。

## P1-C2a 绘制与读取

GraphInstances按类型批量绘制节点，箭头共享一次实例提交；连线仍使用原批量缓冲。筛选/移动更新矩阵及包围球，instanceId只用于当前批次查找，导航/保存仍使用实体UUID。GraphViewport供知识图和执行图复用，材质继承V3语义Tokens；GraphCamera统一管理可中断动画、探索快照与退出聚焦。列表处理Esc后阻止相机重复处理，不改编辑器和弹窗的键盘语义。

Rust knowledge_graph改为一次限定工作区的LEFT JOIN加载关系及全部修订，再按原ID/版本顺序分组。API、表、历史保留和视图保存不变；仍读取全图及全部历史，尚无数据库邻域分页。测量通过隔离数据库与全量GraphData哈希核对，详见ADR0012。

## 回答流与图谱的更新边界

App组合GraphStudio的四个稳定依赖，GraphPage按默认浅比较复用；消息片段和草稿不进入图谱props。图谱自身的导航订阅/状态、知识revision和工作区仍正常更新，执行图保留实际运行轮询。KnowledgeInspector通过受限方法接口打开当前原会话。流式顺序、取消和后端保存语义不变。性能模式使用有界Performance measure与测试端观测，详见ADR0013。


## 图谱按需读取（ADR0014）

正式知识图经graph-query.ts调用graph_query.rs：节点摘要SQL页最多200；当前有效关系只取已加载端点；选择与关联中心按ID补读；展开关系区才读取当前关系页50，展开具体关系才读取历史页50。原load_knowledge_graph保留兼容/审计与基准，正式Graph与RelationshipEditor不再调用它。执行图事实来源、导航实体ID、知识审核与模型调用保持原契约。

快照标记拒绝跨页混合数据，界面丢弃旧范围响应；布局序号来自整个工作区的稳定created_at/id顺序。坐标复用原UPSERT，前端只发送改动坐标。prefix分页可能重复读取旧页，计数/排序仍扫描工作区，密集有效关系尚无边分页；上限和实测边界见graph-on-demand-reads.md，不将SQL LIMIT称为恒定成本查询。


## 多中心关联探索（ADR0015）

Graph的单一range替换为工作区会话内的有序expansions；null表示普通工作区，空列表表示已全部收起的探索。graph-query按各中心的有效一跳范围读取并保存nodeID→所有来源中心的映射，合并节点后读取诱导有效边；收起只移除相应来源，仍有来源或被显式临时显示的节点继续保留。共享位置/选择/知识详情独立于展开来源。

query_graph_nodes兼容单中心，并增加互斥rootNodeIds供准确并集计数，最多20个且逐项检查工作区。所有批次共用原快照标记，异步响应代次保护继续生效；不改数据库表或业务事实。演示在显式demo分支内生成匹配页，复用同一合并流程；正式数据仍由Rust读取。
