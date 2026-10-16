# 检查与验收

## 当前可运行命令

从 `apps/desktop` 执行：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm.cmd run tauri -- build --debug --no-bundle
npm.cmd run test:smoke
```

`test:smoke` 先用已安装 Microsoft Edge 检查网页，再启动刚构建的桌面 exe，连接该测试进程的 WebView2 调试端口检查真实窗口。桌面测试需要先构建 debug exe。只运行浏览器检查可加 `-- --project=edge`。测试使用临时浏览器配置，不访问用户的浏览记录或个人配置。

## 自动检查范围

- 四页导航、当前项、页面标题、直接路径、刷新、返回和未知路径回退。
- 键盘跳转主内容、导航后聚焦、图谱类型键盘切换。
- 浏览器明确为预览，发送与连接功能禁用；桌面实际接入业务。
- 1440×900、1280×800、1024×768、800×600、375×812 四页均无页面级横向溢出，主导航始终可达。
- 真实桌面窗口加载生产资源、四页可切换、生产 CSP 存在，浏览过程无脚本错误或控制台错误。
- 每个窗口尺寸保存页面截图；桌面测试保存原始 viewport、pixelRatio 和 CSP 记录。截图与报告在忽略目录 `test-results` 中，不混入源码提交。

Rust 检查使用真实临时 SQLite：迁移、工作区隔离、独占数据目录、事件不可修改、唯一终态、迟到检查点及中断恢复；另检查 URL 约束、UTF-8 分片、同一分片中的有效与畸形 JSON。测试不会访问正式工作区。

原生聊天集成检查使用隔离 SQLite 和可控 loopback HTTP 服务，覆盖完整回答、重命名、跨工作区生成与草稿、停止保留、畸形流保留、重试不重复上下文、强制退出恢复、连接失败与重连、30 秒超时，以及云端模型别名和未完成下载的模型被阻止。测试服务只用于重现错误分支；真实模型效果需单独验证。

输出预算耗尽单独检查：完成帧中的 `done_reason=length` 保存到执行事件并投影到消息，显示“达到输出上限”，可提高参数重试；截断轮次不重复纳入下一次请求。

正常关窗检查通过 Windows `CloseMainWindow()` 作用于测试自行启动的独立进程，验证生成先取消并保存，重启后为 cancelled；强制结束测试进程则恢复为 interrupted。新建会话期间输入保持禁用，切换完成后再接受输入，防止文字在异步切换中被覆盖。

## 真实本地模型

先启动官方 Ollama 并完整下载 `qwen3:4b-instruct`。执行 `ollama show qwen3:4b-instruct` 核对实际量化；服务仅监听 127.0.0.1，关闭云端功能。从应用目录执行：

```powershell
$env:CORTEXOS_REAL_OLLAMA='1'
npm.cmd run test:smoke -- --project=ollama
Remove-Item Env:CORTEXOS_REAL_OLLAMA
```

检查真实回答、实际输出 token 统计、停止第二次生成、重新打开后完整与部分回答一致。使用独立测试数据库、WebView2 配置和合成问题。截图与原始性能 JSON 保存于根目录 `artifacts/phase-1`；时间是单次冷/热运行的观测，不是稳定基准。配合 `ollama ps` 和 `nvidia-smi` 记录模型加载与 GPU 瞬时读数。

默认真实模型测试保留现有 Ollama 服务。仅当测试调用方明确管理该服务时，额外设置 `CORTEXOS_MANAGED_OLLAMA_PID` 为所启动服务的 PID；测试核对其可执行文件与端口归属后，停止该进程，验证真实断连提示，再以 loopback、关闭云端和单任务配置恢复后台服务。恢复后的 PID 写入验收 JSON。该选项不加入日常默认命令。

开发模式复测可以设置 `$env:CORTEXOS_SMOKE_DEV='1'` 后运行 `npm.cmd run test:smoke -- --project=desktop`。测试复用本机 Vite 服务并执行 `tauri dev --no-watch`；检查真实开发窗口导航和 Vite 直接响应的策略，后者不等同于原生代理响应的 CSP。完成后清除环境变量并重新构建独立 exe，再运行默认完整检查。

## 手动验收项

1. 可手动运行 `npm.cmd run tauri -- dev` 观察开发窗口；该启动路径也由上述开发模式自动检查覆盖。发布时是否出现控制台窗口需要另做 release 验收。
2. 在 Windows 系统设置中分别选择 125% 与 150% 缩放，重新打开应用并检查文字和主操作；记录实际结果。浏览器 viewport 变化不能替代这项实测。
3. 用 Windows 键盘和读屏检查焦点顺序及中文播报。自动 DOM 检查不能代表完整读屏验收。
4. 对实际截图检查对齐、空白比例、正文宽度及窄窗口布局。

## 后续阶段

Phase 2 增加修订事务、审批与并发冲突；Phase 3 增加事件投影和目标 GPU 图谱性能；Phase 4 增加文件权限、引用、版本重放及备份恢复。

实际命令、失败与限制统一记录在 `milestone-log.md`。
