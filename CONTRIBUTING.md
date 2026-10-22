# 贡献与开发

CortexOS 当前面向 Windows 桌面，采用 React、TypeScript、Vite、Tauri 2、Rust、SQLite 与 Three.js。仓库已公开，但尚未指定项目许可证；在提交外部代码或再分发前，请先与维护者明确授权条款。

## 准备环境

- Windows 开发环境，当前原生验收基于 Windows 11。
- Node.js 22.12+ 和 npm；依赖版本以 `apps/desktop/package.json` 及锁文件为准。
- Rust MSVC 工具链；根目录 `rust-toolchain.toml` 为本项目选择工具链，保留个人全局默认配置。
- Visual Studio C++ Build Tools、Windows SDK 和 WebView2，安装方法见 [Tauri Windows 前置要求](https://v2.tauri.app/start/prerequisites/)。
- 本地模型验证另需 Ollama 与已下载模型；单纯类型检查和构建不依赖它们。
- 原生自动化使用已安装 Microsoft Edge，通过隔离 WebView2 连接调试构建。

## 运行与构建

```powershell
git clone https://github.com/hfdsdfgr/CortexOS.git
cd CortexOS/apps/desktop
npm.cmd ci
npm.cmd run tauri -- dev
```

浏览器预览使用 `npm.cmd run dev`，地址为 `http://127.0.0.1:1420`，不能替代桌面 IPC 和真实模型检查。

```powershell
# 类型与前端构建
npm.cmd run typecheck
npm.cmd run build

# Windows Release 与 NSIS 安装包
npm.cmd run tauri -- build --bundles nsis
```

安装包生成于 `apps/desktop/src-tauri/target/release/bundle/nsis/`。构建前正常关闭占用目标 exe 的程序；同一工作区共用 dist，避免并行执行 debug 和 Release 构建。

## 选择检查范围

纯文档修改检查事实、路径、链接与差异即可。代码修改先检查调用链和状态边界，再按变化选择必要专项；不要求每次运行全量测试。检查命令从 `apps/desktop` 执行：

```powershell
# 构建隔离原生检查需要的 debug exe
npm.cmd run tauri -- build --debug --no-bundle

# 任选与改动相关的检查，桌面项需要上一步产物
npx.cmd playwright test --project edge
npx.cmd playwright test markdown-camera.spec.ts --project desktop

# Rust 改动涉及对应逻辑时使用
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked <test_filter>
```

真实模型专项为显式选择，使用合成问题和隔离数据：

```powershell
$env:CORTEXOS_REAL_OLLAMA='1'
try {
  npx.cmd playwright test --project ollama
} finally {
  Remove-Item Env:CORTEXOS_REAL_OLLAMA -ErrorAction SilentlyContinue
}
```

其他专项与前置条件见 [检查方法](docs/test-plan.md)。报告明确区分浏览器、原生 WebView2、真实模型和人工检查；本机 `artifacts/` 里的截图和数据不会随克隆提供。

## 修改约定

先读 [AGENTS.md](AGENTS.md)、[产品总纲](development.md)、[开发规范](docs/development-standards.md)、[实施计划](docs/implementation-plan.md) 与 [HTML 参考界面规范](docs/design/html-prototype-ui.md)。

复用共享组件、语义 CSS Tokens 和现有状态。前端通过类型化 Tauri 命令访问 Rust，数据库、模型和文件操作留在后端。知识修改保留版本，执行记录只保存真实事实；修改历史迁移会破坏校验，应使用新增迁移。

凭据、私人聊天、导入文件和本机产物保持在提交范围外。使用正常凭据管理器推送，不把 token 写入 URL、源码或输出。提交 npm 与 Cargo 锁文件的实际依赖变化。

## 提交问题与改动

一般问题使用 [Issues](https://github.com/hfdsdfgr/CortexOS/issues)；安全问题见 [SECURITY.md](SECURITY.md)。PR 描述说明触发场景、最终行为、实际检查及未验证项，相关界面改动附真实截图。开发阶段的完成记录写入 `docs/milestone-log.md`，历史失败与验证边界保持可追溯。
