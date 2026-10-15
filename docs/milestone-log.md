# 里程碑记录

## Phase 0：可运行应用壳与架构

日期：2026-10-15。状态：核心验收通过；人工补充项见下方。下一阶段尚未开始。

### 范围与验收

目标为检查实际主机环境、建立最小 Tauri 2 + React + TypeScript 应用、实现四页导航与明确占位状态、形成架构和数据语义决定。验收要求为真实桌面窗口可打开并导航、前端构建与 Rust 检查通过、未实现功能不产生假成功。

用户明确授权安装 MSVC Rust 工具链，安装后通过项目文件选择，保留原 GNU 全局默认。没有安装 Ollama、下载模型、创建数据库或接入 3D。

### 交付文件

- 根目录：`AGENTS.md`、`README.md`、`rust-toolchain.toml`、`.gitignore`。
- 应用：`apps/desktop/package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`README.md`、`.gitignore`。
- UI：`src/main.tsx`、`src/App.tsx`、`src/App.css`、`src/vite-env.d.ts`、`public/cortex.svg`，均相对应用目录。
- 桌面：`src-tauri/Cargo.toml`、`Cargo.lock`、`build.rs`、`src/main.rs`、`src/lib.rs`、`tauri.conf.json`、`capabilities/default.json`、`.gitignore`；图标为 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.png`、`icon.ico`、`icon.icns`。
- 检查：`playwright.config.ts`、`tests/app.spec.ts`、`tests/desktop.spec.ts`。
- 文档：PRD、architecture、database-schema、security、environment、test-plan、三份 ADR、开发规范与实施计划更新，以及本记录。

官方模板的 greet 命令、opener 插件、样例资源和编辑器推荐已移除。未创建未来共享包、模型服务或空业务目录。完整提交清单可通过本阶段提交的 `git show --name-status` 查看。

### 实际执行的主要命令

以下应用命令从 `apps/desktop` 执行；初始化和根目录检查除外。

| 命令/检查 | 实际结果 |
| --- | --- |
| `node --version`、`npm --version`、`pnpm --version`、`rustc --version`、`cargo --version`、`git --version` | 已执行；具体版本见 environment.md |
| `rustup toolchain list`、`rustup target list --installed` | 初始仅 GNU，安装后 GNU 仍为 default，MSVC 为项目 active |
| `nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used --format=csv,noheader` | RTX 4070 Laptop，8188 MiB，总纲硬件方向吻合 |
| Windows 注册表、vswhere、WebView2 固定目录、Ollama loopback 检查 | 编译环境已就绪；Ollama 服务不可用 |
| `rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal` | 用户授权后成功，rustc/cargo 1.99.0 |
| `npm.cmd exec --yes --package=create-tauri-app@4.7.5 -- create-tauri-app apps/desktop --template react-ts --manager npm --identifier com.cortexos.desktop --yes` | 从根目录成功生成模板，再精简配置 |
| `npm.cmd install --no-audit --no-fund` | 成功，生成 npm 锁文件 |
| `npm.cmd run typecheck` | 通过，包含 UI、配置与检查代码 |
| `npm.cmd run build` | 通过，生产资源生成 |
| `npm.cmd run tauri -- icon public/cortex.svg --output src-tauri/icons` | 成功；多余移动端/商店图标随后在核对目标目录后清理 |
| `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` | 从根目录首次通过，记录首次 1m14s；不是启动性能 |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 应用目录再次通过，锁文件有效 |
| `npm.cmd exec --yes --package=prettier@3.9.10 -- prettier --write 'src/**/*.{ts,tsx,css}' 'tests/*.ts' '*.ts' '*.json' 'src-tauri/*.json' 'src-tauri/capabilities/*.json'` | 格式化成功，未加入运行依赖；后续修改过的代码再次格式化 |
| `npm.cmd run tauri -- build --debug --no-bundle` | 通过，最终 exe 重新嵌入生产资源 |
| `npm.cmd run test:smoke -- --project=edge` | 初始浏览器检查 7/7 通过 |
| `$env:CORTEXOS_SMOKE_DEV='1'; npm.cmd run test:smoke -- --project=desktop` | 最终开发模式 1/1 通过，内部实际执行 `tauri dev --no-watch` |
| `npm.cmd run test:smoke` | 最终完整检查 8/8 通过，11.2s |
| `git diff --check` | 通过；提交前另检查忽略规则与凭据未进入暂存内容 |

### 实际发现与修正

1. PowerShell 的 npm 包装脚本未正确转发初始化工具参数，首轮报非终端错误；改用 `npm.cmd` 后生成成功。
2. 原生调试首次使用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`，两次未连接成功。改为 debug-only 的已校验端口配置，并使用独立 WebView2 数据目录后，原生检查通过。release 不编译该测试入口。
3. 开发模式几次检查因 CSP 证据缺失失败：Vite 直接响应与 Tauri dev 代理后的响应不同。为 Vite 增加共用策略头，并将开发服务器策略检查与原生导航检查明确区分；生产构建仍必须从原生响应读取并核验 CSP，不能使用服务器回退掩盖失败。
4. 图标生成工具报告一份系统字体 malformed 警告，但项目 SVG 不含文字，图标文件成功生成。测试工具还报告 NO_COLOR/FORCE_COLOR 环境提示，不影响验收结果。

### 真实桌面结果

- 独立程序：`apps/desktop/src-tauri/target/debug/cortexos-desktop.exe`。
- 原生生产资源 URL：`http://tauri.localhost/#/settings`；开发 URL：`http://127.0.0.1:1420/#/settings`。
- 两种模式实际 WebView2 viewport：1440×900 CSS px，devicePixelRatio=1.25。
- 生产响应 CSP 含 `script-src 'self'`、Tauri 注入脚本哈希、`object-src 'none'`、`frame-src 'none'`；没有 unsafe-inline 脚本放宽。
- 四页原生导航通过，重载后未记录脚本或控制台错误。测试结束关闭其启动的进程树。
- 浏览器四页分别在 1440×900、1280×800、1024×768、800×600、375×812 验证，无页面级横向溢出；导航、页面标题、刷新、返回及键盘操作通过。
- 实际检查了桌面对话页，以及浏览器对话、设置和 375px 知识页截图，布局层级与操作入口清晰。最终截图副本在忽略目录 `artifacts/phase-0`，原始检查输出在 `apps/desktop/test-results`。
- 设计色计算：正文对白 16.22:1，次要文字对白 6.33:1，主按钮白字 6.36:1。输入边界进一步加深，避免只在纯白背景接近 3:1 下限。

### 限制与下一步

- Phase 0 没有模型或数据业务能力，所有相关入口已如实标注。没有真实回答、持久化或 3D 性能结果。
- Windows 150% 系统缩放、完整读屏体验、release 控制台行为、安装包和安装回归尚未验收。125% 是本机原生实测，其他 viewport 检查不冒充系统缩放测试。人工步骤见 test-plan.md。
- Ollama 不在 PATH/标准安装位置，loopback 服务不可用。Phase 1 的真实模型验收前需获得服务安装与模型下载的明确授权，或由用户提供已准备好的本机服务。
- 下一实施范围：工作区/会话 SQLite 最小迁移，Ollama 检测与流式对话、取消和错误恢复，从第一次请求记录实际执行事件。先完成真实对话与重启保存，再进入知识和图谱。

按总纲在 Phase 0 验收点停止，尚未执行 Phase 1。
