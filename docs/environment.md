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
| Ollama | PATH 与标准安装位置未找到；127.0.0.1:11434/api/version 不可用 | Phase 1 的真实模型验收前需准备服务与模型；本轮不安装 |

## 检查说明

首次沙箱内 Get-CimInstance 被拒绝，随后用 Windows 版本注册表、vswhere、固定运行时目录和官方工具版本完成检查。没有全盘扫描。

`rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal` 已获用户同意；使用项目工具链文件，不运行 `rustup default`。

npm registry 核验 React 19.3.1、Vite 8.3.4、TypeScript 7.0.2 与 Tauri CLI 2.12.3 的实际元数据后固定版本。运行时支持与锁文件以实际构建为最终依据，不把未来升级自动视为兼容。

系统级工具不自动安装。Ollama 服务、模型下载与驱动升级均留到有明确需求的阶段。
