# CortexOS 3D

面向 Windows 的本地 AI 项目工作台：对话、可追溯知识、版本审核，以及知识关系和实际执行过程的 3D 探索。

当前实现 Phase 1：工作区与会话、Ollama 本地流式对话、停止生成、错误重试、重启恢复和执行详情。会话自动保存到本机 SQLite。知识编辑与 3D 留在后续阶段，页面已明确标注。

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
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm.cmd run tauri -- build --debug --no-bundle
npm.cmd run test:smoke
```

独立调试版位于 `apps/desktop/src-tauri/target/debug/cortexos-desktop.exe`，可直接打开。主机全局 Rust 默认保持 GNU，本项目通过工具链文件选择 MSVC。应用支持浏览已保存的会话；发送新问题需要本机 Ollama 与完整下载的模型。

## 第一次使用

1. 启动官方 Ollama。服务不可用时，在终端执行 `ollama serve` 并保持终端打开；已运行的服务无需重复启动。
2. 在终端执行 `ollama pull qwen3:4b-instruct`。下载约 2.5 GB；中断后重跑同一命令可续传。当前终端找不到命令时，重新打开终端，或使用 `$env:LOCALAPPDATA/Programs/Ollama/ollama.exe`。
3. 打开 CortexOS，创建工作区，在“设置”点击“检测连接”，确认模型后返回“对话”。Enter 发送，Shift+Enter 换行；生成期间可停止，部分回答保留。
4. 从回答下方打开“执行过程”，查看实际事件、生成配置和上下文消息定位。当前使用最近的完整会话轮次，不使用文件检索。

默认连接固定为 `127.0.0.1:11434`，上下文 4096、输出最多 512、温度 0.3、超时 180 秒。参数可在设置中修改，用于下一次回答。模型是否适合当前机器，以实际验收为准。

默认模型采用 `qwen3:4b-instruct`。原计划的 `qwen3:4b` 当前实际指向 Thinking 版本，实测 `think:false` 仍产生冗长分析并耗尽输出预算，因此改用同系列 Instruct 版本；原模型保留，可自行选择。两种模型总磁盘占用约 5 GB，一次只加载一个。相关区别与实际测量见里程碑和 ADR 0004。

当前主机经用户授权安装官方 Ollama，并设置用户级 `OLLAMA_HOST=127.0.0.1:11434`、`OLLAMA_NO_CLOUD=1`、`OLLAMA_CONTEXT_LENGTH=4096`、`OLLAMA_NUM_PARALLEL=1`、`OLLAMA_MAX_LOADED_MODELS=1`、`OLLAMA_KEEP_ALIVE=5m`。环境变化需要重启 Ollama。应用还会检查模型来源并拒绝云端模型别名。

真实模型验收单独运行，使用隔离测试数据与合成问题：

```powershell
cd apps/desktop
$env:CORTEXOS_REAL_OLLAMA='1'
npm.cmd run test:smoke -- --project=ollama
Remove-Item Env:CORTEXOS_REAL_OLLAMA
```

默认自动检查使用可控本机测试服务覆盖错误分支，不能代替真实模型验收。测试不会读取正式工作区数据。当前备份、导出、删除、知识审核与安装包尚未提供；数据目录可在设置中查看，完整限制见里程碑记录。

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
