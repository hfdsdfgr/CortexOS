# 开发环境检查

2026-10-15，目标 Windows 主机，只读检查与获授权的工具链安装。

| 项目 | 实际结果 | 结论 |
| --- | --- | --- |
| Windows | 25H2，build 26200.9168；注册表 ProductName 仍返回 Windows 10 Pro | 按实际 build 记录，不以旧品牌字段判断系统 |
| Node | 22.14.0 | 满足所选 Vite 的 22.12+ 要求 |
| npm | 10.9.2 | 使用 npm.cmd，避免 PowerShell 包装脚本转发参数差异 |
| pnpm | 11.25.0 | 已有，当前单应用不使用 |
| Git | 2.54.0.windows.1 | 本项目独立仓库，main，私有远程已配置 |
| 原 Rust | rustc/cargo 1.98.1，默认 GNU | 不更改全局默认 |
| 项目 Rust | rustc 1.99.0，stable-x86_64-pc-windows-msvc，minimal | 用户明确授权后安装，项目文件选择 |
| MSVC C++ | Visual Studio Community 2022 17.13.35931.197，VC x64/x86 组件存在 | cl/link 不在普通 PATH，Rust 使用安装元数据定位；最终以编译结果判断 |
| WebView2 | 155.0.4283.45 | Runtime 目录存在，最终以原生启动检查判断 |
| Edge | 系统 Microsoft Edge 已安装 | 用于浏览器冒烟，不下载另一套 Chromium |
| GPU | RTX 4070 Laptop，驱动 610.74，总显存 8188 MiB | 一次查询时已用 1158 MiB；仅瞬时读数，不是预算保证 |
| Ollama | Phase 0 未安装；Phase 1 经用户授权安装官方 0.40.4 | 当前账号安装，服务仅监听 127.0.0.1:11434，云端功能关闭 |

## 检查说明

首次沙箱内 Get-CimInstance 被拒绝，随后用 Windows 版本注册表、vswhere、固定运行时目录和官方工具版本完成检查。没有全盘扫描。

`rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal` 已获用户同意；使用项目工具链文件，不运行 `rustup default`。

npm registry 核验 React 19.3.1、Vite 8.3.4、TypeScript 7.0.2 与 Tauri CLI 2.12.3 的实际元数据后固定版本。运行时支持与锁文件以实际构建为最终依据，不把未来升级自动视为兼容。

Phase 1 另在该 MSVC 工具链安装官方 rustfmt 组件，供 `cargo fmt` 使用，未切换全局工具链。

## Phase 1 本地模型环境

用户明确同意安装官方 Ollama 并下载 `qwen3:4b`。从 GitHub 官方 ollama/ollama 的 v0.40.4 release 下载 Windows 安装包，核对 release 资产 SHA-256 `45fcd47d70dd047ab95736802e71a7497ef1a473a50470471fc2fb0eb90badde`，Authenticode 状态 Valid，签名者 Ollama Inc.。安装退出码 0，无需重启；程序在 `%LOCALAPPDATA%/Programs/Ollama`。

当前用户环境设为：

```text
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_NO_CLOUD=1
OLLAMA_CONTEXT_LENGTH=4096
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_KEEP_ALIVE=5m
```

实际用 `ollama serve` 启动隐藏后台服务，核对 API 版本 0.40.4、监听地址及服务日志 cloud disabled。官方托盘 UI 安装成功，但本轮没有证明托盘能自动拉起模型服务或重启后自动可用；必要时在终端执行 `ollama serve`。新终端才会读取安装后的 PATH。

模型首次下载因远程分片连接超时中断，使用相同 pull 命令续传。最终模型信息与真实运行结果在 `milestone-log.md` 记录。安装包、安装日志、服务诊断和模型测试截图保存在忽略目录 `artifacts`，不上传仓库。驱动未修改。

实际 `qwen3:4b` 为 Thinking 版本，模型 ID 359d7dd4bcda、Q4_K_M、2,497,293,931 字节；`think:false` 仍返回分析式文本且耗尽 512 输出预算。已在同一模型准备范围内补充下载同系列 `qwen3:4b-instruct` 并改为默认，原模型保留，磁盘总占用约 5 GB。一次只加载一个模型；默认上下文仍为 4096。官方标签区别及决定见 ADR 0004。

2026-10-16 最终模型登记与真实桌面验收通过：Instruct 模型 ID `0edcdef34593`、4.0B、Q4_K_M、2,497,293,803 字节。完整官方权重 SHA-256 校验通过。`ollama ps` 实测 100% GPU、3.2 GB、上下文 4096；生成后 GPU 总占用快照 4437 MiB。服务断连恢复测试后，监听地址再次确认为 127.0.0.1:11434。详细时间与限制见里程碑，以上均为单次观测。
