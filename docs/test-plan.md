# 检查与验收

## Phase 0 可运行命令

从 `apps/desktop` 执行：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml --locked
npm.cmd run tauri -- build --debug --no-bundle
npm.cmd run test:smoke
```

`test:smoke` 先用已安装 Microsoft Edge 检查网页，再启动刚构建的桌面 exe，连接该测试进程的 WebView2 调试端口检查真实窗口。桌面测试需要先构建 debug exe。只运行浏览器检查可加 `-- --project=edge`。测试使用临时浏览器配置，不访问用户的浏览记录或个人配置。

## 自动检查范围

- 四页导航、当前项、页面标题、直接路径、刷新、返回和未知路径回退。
- 键盘跳转主内容、导航后聚焦、图谱类型键盘切换。
- 禁用发送和连接测试，避免占位功能呈现假成功。
- 1440×900、1280×800、1024×768、800×600、375×812 四页均无页面级横向溢出，主导航始终可达。
- 真实桌面窗口加载生产资源、四页可切换、生产 CSP 存在，浏览过程无脚本错误或控制台错误。
- 每个窗口尺寸保存页面截图；桌面测试保存原始 viewport、pixelRatio 和 CSP 记录。截图与报告在忽略目录 `test-results` 中，不混入源码提交。

测试仅覆盖当前交互，不以假模型和假数据库证明未来功能。当前 Rust 只有窗口启动，不为模板函数添加镜像单元测试。

开发模式复测可以设置 `$env:CORTEXOS_SMOKE_DEV='1'` 后运行 `npm.cmd run test:smoke -- --project=desktop`。测试复用本机 Vite 服务并执行 `tauri dev --no-watch`；检查真实开发窗口导航和 Vite 直接响应的策略，后者不等同于原生代理响应的 CSP。完成后清除环境变量并重新构建独立 exe，再运行默认完整检查。

## 手动验收项

1. 可手动运行 `npm.cmd run tauri -- dev` 观察开发窗口；该启动路径也由上述开发模式自动检查覆盖。发布时是否出现控制台窗口需要另做 release 验收。
2. 在 Windows 系统设置中分别选择 125% 与 150% 缩放，重新打开应用并检查文字和主操作；记录实际结果。浏览器 viewport 变化不能替代这项实测。
3. 用 Windows 键盘和读屏检查焦点顺序及中文播报。自动 DOM 检查不能代表完整读屏验收。
4. 对实际截图检查对齐、空白比例、正文宽度及窄窗口布局。

## 后续阶段

Phase 1 增加真实 Ollama 流解析、终态竞争、错误恢复、迁移重启和双工作区隔离；Phase 2 增加修订事务、审批与并发冲突；Phase 3 增加事件投影和目标 GPU 图谱性能；Phase 4 增加文件权限、引用、版本重放及备份恢复。

实际命令、失败与限制统一记录在 `milestone-log.md`。
