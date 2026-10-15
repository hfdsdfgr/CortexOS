# CortexOS 3D

面向 Windows 的本地 AI 项目工作台：对话、可追溯知识、版本审核，以及知识关系和实际执行过程的 3D 探索。

当前处于 Phase 0：Tauri 2 + React + TypeScript 应用壳，包含对话、知识、图谱、设置四个页面。模型连接、数据库、知识编辑与 3D 尚未接入，界面已明确标注。

## 本地运行

Windows 需要 Node 22.12+、Visual Studio C++ Build Tools、WebView2 与 MSVC Rust 工具链。当前主机的具体版本见 [环境检查](docs/environment.md)。

```powershell
cd apps/desktop
npm.cmd ci
npm.cmd run tauri -- dev
```

仅浏览器预览使用 `npm.cmd run dev`，打开 `http://127.0.0.1:1420`。预览不代表桌面验证。

```powershell
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml --locked
npm.cmd run tauri -- build --debug --no-bundle
npm.cmd run test:smoke
```

独立调试版位于 `apps/desktop/src-tauri/target/debug/cortexos-desktop.exe`。主机全局 Rust 默认保持 GNU，本项目通过工具链文件选择 MSVC。当前不需要安装 Ollama 来浏览 Phase 0 页面；Phase 1 真实对话验收需要另行准备本机服务与模型。

## 开发文档

- [项目总纲](development.md)
- [开发与交互规范](docs/development-standards.md)
- [实施计划与阶段验收](docs/implementation-plan.md)
- [架构与边界](docs/architecture.md)
- [检查方法](docs/test-plan.md)
- [实际里程碑记录](docs/milestone-log.md)

## 仓库与推送

本目录使用独立 Git 仓库，主分支为 `main`。远程为私有 GitHub 仓库 [hfdsdfgr/CortexOS](https://github.com/hfdsdfgr/CortexOS)。

本机为该仓库配置 Windows Git Credential Manager，使用用户提供的最新 token。在本目录正常执行 `git push` 即可复用凭据。凭据配置属于本机，不随克隆迁移到其他设备。

根目录 `Gittoken.txt` 仅供本机使用，已加入忽略规则；提交前保持该文件未被跟踪。token 不应出现在源码、文档或远程 URL 中。更换 token 后需要更新本机凭据。
