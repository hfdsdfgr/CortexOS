# CortexOS 桌面应用

这是 CortexOS 的 React/TypeScript 前端与 Tauri/Rust 后端。使用说明从 [项目首页](../../README.md) 进入，环境准备与贡献约定见 [开发指南](../../CONTRIBUTING.md)。

## 从本目录运行

```powershell
npm.cmd ci
npm.cmd run tauri -- dev
```

| 命令 | 用途 |
| --- | --- |
| `npm.cmd run dev` | 仅浏览器预览，地址 `http://127.0.0.1:1420` |
| `npm.cmd run typecheck` | TypeScript 类型检查 |
| `npm.cmd run build` | 类型检查与 Vite 生产资源构建 |
| `npm.cmd run tauri -- build --debug --no-bundle` | 隔离原生检查所需的 debug exe |
| `npm.cmd run tauri -- build --bundles nsis` | Windows x64 Release 与 NSIS 安装包 |

按变化选择必要检查，具体项目和真实模型开关见 [检查方法](../../docs/test-plan.md)，而非每次运行全部测试。

## 代码入口

- `src/App.tsx`、`src/studio.ts`：共享状态、页面和编辑器装配。
- `src/components/`：对话、真实依据和共享界面；`src/styles/`：HTML 参考对应的主题、布局、控件、页面和动效 Tokens/样式。
- `src/Knowledge.tsx`、`src/SourceBrowser.tsx`：知识版本与文件资料。
- `src/Graph.tsx`、`src/ExecutionTrace.tsx`：知识与执行两种图；共享 `GraphViewport.tsx`。
- `src-tauri/src/`：命令、数据库、模型、检索、来源及执行服务。
- `src-tauri/migrations/`：版本化数据库迁移，已应用脚本保持不变。
- `tests/`：浏览器和隔离原生专项；正式用户数据库不作为测试输入。

前端经 Tauri IPC 访问业务，SQLite、模型 HTTP 与文件读取由 Rust 管理。模块与数据流见 [架构](../../docs/architecture.md)。
