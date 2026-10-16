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
