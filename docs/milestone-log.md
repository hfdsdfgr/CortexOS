# 里程碑记录

## Phase 0：可运行应用壳与架构

日期：2026-10-15。状态：核心验收通过；人工补充项见下方。本节为 Phase 0 历史记录。

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

## Phase 1：本地对话与保存

日期：2026-10-15 至 2026-10-16。状态：Phase 1 核心验收通过，包含真实模型与实际服务断连恢复；人工补充项见下方。

### 范围与授权

Phase 0 汇报后，用户授权继续实施，并明确允许安装官方 Ollama 与下载 qwen3:4b。本阶段实现工作区/会话、真实本地流式对话、停止、错误恢复、SQLite 保存及二维执行详情；知识编辑、文件导入、3D 和安装包仍属后续阶段。

### 实现

- `src-tauri/migrations/0001_initial.sql` 与 `src/db.rs`：版本/校验迁移、WAL、工作区复合外键、事务写入、250 ms 输出检查点、唯一活动运行、不可修改事件、独占数据目录和中断恢复。
- `src-tauri/src/models.rs`、`ollama.rs`、`commands.rs`：类型和参数校验、仅 loopback 的 reqwest、模型来源检查、NDJSON 流解析、取消、超时及按 run 的 Channel；命令通过 build.rs 与 capability 逐项授权。
- `src/studio.ts`、`Chat.tsx`、`Settings.tsx`、`App.tsx`、`App.css`：工作区选择与创建、会话列表及重命名、IME 安全发送、停止/重试、滚动保护、设置保存和执行时间线。界面沿用会话列表、阅读区、底部输入区与按需详情抽屉。
- `tests/native.ts`、`chat.spec.ts`、`ollama.spec.ts`：原生启动复用、独立数据库/浏览器配置、可控错误回归与真实模型验收分别运行。相关锁文件、文档及 ADR 0004 同步更新。

### 已执行检查

应用命令从 `apps/desktop` 执行：

| 命令 | 结果 |
| --- | --- |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | 成功，使用项目 MSVC 的官方 rustfmt |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 4/4 通过；涵盖隔离、迁移校验、恢复、事件、终态、上下文整轮预算与流分片 |
| `npm.cmd run tauri -- build --debug --no-bundle` | 通过，包含 TypeScript 与 Vite 生产构建 |
| `npm.cmd run test:smoke` | 9/9 通过，2026-10-16 最近一次 46.4 秒；7 项浏览器与 2 项真实桌面检查，含正常关窗、会话输入保护、输出上限与重试 |
| `npm.cmd run test:smoke -- --project=desktop tests/chat.spec.ts` | 补充检查 1/1 通过，39.7 秒；包含正常关窗保存与会话创建输入保护 |
| `$env:CORTEXOS_REAL_OLLAMA='1'; $env:CORTEXOS_MANAGED_OLLAMA_PID=<本任务服务 PID>; npm.cmd run test:smoke` | 最终 10/10 通过，Playwright 报告约 1.2 分钟；含 7 项浏览器、2 项原生与 1 项真实 Ollama 检查；结束清除测试变量 |

可控服务仅模拟模型接口；SQLite、IPC、原生 WebView2 与应用流程都是真实实现。完整回归覆盖停止后保存、工作区隔离、会话重命名、重试、中断恢复、离线/重连、30 秒超时、云端模型阻止及模型缺失。

### 发现与修正

1. 首次 Rust 编译发现 MutexGuard 临时借用类型不符，改用局部 guard 后通过。
2. 原生检查暴露了测试中的浮点严格比较、重复标签定位和 IPC 错误类型断言问题；分别改为近似比较、明确 textbox 角色和错误断言。
3. 流解析检查发现同一网络分片中的畸形 JSON 会丢弃前面的有效帧；改为按帧依次交付，再在错误处终止。整合检查已使用同一响应分片验证部分内容保存。
4. 上下文只纳入成功完整轮次，避免失败重试重复问题和截断后孤立的回答；小预算回归已覆盖。
5. 官方模型下载首次在约 178 MB 处遇远端超时，已续传；安装包哈希与签名核验、安装和 loopback/关闭云端检查已通过。
6. 真实模型停止检查最初读取到上一条消息，过早取消而得到空内容；明确等待第二条回答出现并有实际文字后，通过停止与重启保存检查。
7. 首轮机械验收虽通过，截图复核发现 `qwen3:4b` 当前实际为 Thinking 标签，`think:false` 仍输出分析式文字，默认 512 token 全部耗尽。该轮 2.396 秒出现文字、9.868 秒结束、512 输出 token、GPU 总用量 4246 MiB（含桌面）仅作为不合适默认模型的基线，不作为完整回答验收。已改用同系列 `qwen3:4b-instruct`；新增 `done_reason` 保存、截断提示与重试，真实模型验收要求以 `stop` 正常结束。
8. 新建会话后立即输入存在异步切换覆盖草稿的窗口；创建和加载期间短暂禁用输入并显示创建反馈，完成后恢复编辑。原生回归通过。用测试进程的 Windows `CloseMainWindow()` 验证正常关闭生成中的窗口，重启后 run 为 cancelled，部分回答存在；强制退出仍为 interrupted，二者分别验证。
9. 10 月 16 日继续时原服务和下载进程已结束，未确认分片的进度未持久化。恢复同一模型目录后重新下载；范围测速显示现有代理更快，转用官方 registry 的同一权重资源。网络会中断较大 TLS 响应，因此保留连续前缀、分段下载并核对 Content-Range；最终完整文件通过官方 SHA-256 后才交给 Ollama 登记。官方标签清单、下载与校验记录在本机 artifacts 中；没有修改系统网络配置。

### 真实模型与硬件结果

2026-10-16，真实 Windows WebView2、独立测试数据库及合成中文问题。`qwen3:4b-instruct` 的实际模型 ID 为 `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`，4.0B、Q4_K_M，模型列表大小 2,497,293,803 字节；权重文件 SHA-256 为 `85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9`。

| 项目 | 本次实际结果 |
| --- | --- |
| UI 首段文字 / 完整回答 | 4444 ms / 5284 ms，包含界面与 IPC 等开销 |
| Ollama 总耗时 / 模型加载 | 4913 ms / 3970 ms |
| 实际输入 / 输出 | 91 / 52 token；`done_reason=stop`，完整返回三条中文建议 |
| 生成阶段速度 | 52 token / 0.816006 秒，约 63.7 token/s；不含模型加载 |
| 运行设备 | RTX 4070 Laptop，驱动 610.74，总显存 8188 MiB |
| 模型驻留 | `ollama ps` 报告 3.2 GB、100% GPU、上下文 4096 |
| GPU 总占用快照 | 4437 MiB，包含桌面和其他 GPU 使用，不能当作模型独占预算 |
| 停止与重启保存 | 第二次生成停止后保留 10 个字符；重开后完整与部分回答均一致 |
| 实际服务停止与恢复 | 停止本任务管理的服务后，应用保存 failed 并提示连接失败；恢复服务、重新检测后再次得到完整真实回答 |

这是模型未加载时一次请求的观测，磁盘及驱动缓存未清空，不是稳定基准。实际检查了 `artifacts/phase-1/native-real-chat.png` 和 `native-real-execution.png`：回答正文完整，主要操作集中于对话，执行时间线按需展开，没有将模型生成的分析文字当作执行依据。原始数值在同目录 `real-model-report.json`；测试使用独立数据库和 WebView2 配置，没有写入正式工作区。

### 限制与下一步

未验收的人工项目仍包括 Windows 150% 系统缩放、完整读屏、release 与安装包。未发送草稿仅在窗口内保存；强制退出只恢复已提交输出检查点。数据未加密，备份/导出与删除尚未提供。当前按最近完整轮次保守选择上下文，没有文件检索、知识编辑或 3D。

Phase 1 停在本阶段验收点。下一阶段先实现知识列表、详情与“回答片段 → 草案 → 用户确认 → 版本记录”的二维闭环，再连接图谱。


## UI 精简与工作台视觉调整 — 2026-10-16

范围：根据用户对小灰字、圆角和边框过多的反馈，调整现有对话、知识、图谱、设置页面。采用蓝黑顶部/主导航、浅灰蓝会话栏、白色内容画布；强调色集中在选择和主操作。减少区域框线，控件圆角为 2–3px，浮层为 4px；设置沿用开放式分组表单。

文案：移除页标题下的宣传说明、每条回答重复的无来源说明及重复保存提示。输入区快捷键/上下文规则、模型建议、隐私说明改用原生 details 按需展开。保留输入可访问标签、当前会话名称、生成状态、截断警告、错误、未保存修改与未开放标记。未改动后端、数据库或依赖。

实际命令与检查：

- `npm.cmd --prefix apps/desktop run build`：类型检查与 Vite 构建通过。
- 在 apps/desktop 执行 `npm.cmd run tauri -- build --debug --no-bundle`：独立 debug 桌面程序构建通过。
- `npm.cmd run test:smoke -- --project=edge`：7 个用例断言通过，但沙箱内结束清理挂起，手动终止；最终在正常桌面权限下运行 `npm.cmd run test:smoke -- --project=edge --output=test-results-ui`，7/7 通过，正常退出（7.5 秒）。覆盖四页、键盘、导航及 1440/1280/1024/800/375 宽度。
- `npm.cmd run test:smoke -- --project=desktop`：沙箱内首次 2 项因 CDP 超时/连接重置失败；相同命令在正常桌面权限下重跑 2/2 通过（38.3 秒）。原生 WebView2 1440×900、DPR 1.25；检查生产 CSP、导航和隔离 SQLite 的生成/停止/错误/重启恢复。聊天使用受控模型 fixture；本次未重跑真实模型性能测试。
- `git diff --check`：通过。

人工查看浏览器对话/设置、375px 对话及原生对话/错误恢复截图。截图归档在 `artifacts/ui-refresh/`，浏览器截图从临时输出目录移入 browser 子目录；原生对话和设置分别为 desktop-chat.png、desktop-settings.png。未进行 Windows 150% 缩放或完整读屏验收。

源码：App.css、App.tsx、Chat.tsx、Settings.tsx；规范与计划同步更新。本次停在现有 UI 调整验收点，Phase 2 尚未开始。
