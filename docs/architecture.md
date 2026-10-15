# 架构与边界

Phase 0，2026-10-15。技术方向沿用总纲，决定见 `ADR`。

## 当前实现

```text
Tauri 主窗口（WebView2）
  └─ Vite 构建的 React + TypeScript UI
       ├─ 主导航 / Hash 路径 / 页面焦点
       ├─ 对话 / 知识 / 图谱 / 设置空态
       └─ 本地 SVG、图标与 CSS 设计变量
```

Rust 只有窗口启动入口，没有业务命令、插件、文件访问或网络客户端。前端没有 Tauri JS API 依赖。能力列表为空，不授权 frontend IPC 功能；Tauri 自身窗口与运行时继续工作。

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

先完成单模型供应方、单活动生成任务和直接调用，不提前设计插件容器或服务框架。出现真实跨页面共享状态时再引入 Zustand。

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
