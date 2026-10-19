# CortexOS 3D

面向 Windows 的本地 AI 项目工作台：对话、可追溯知识、版本审核，以及知识关系和实际执行过程的 3D 探索。

当前实现 Phase 2、认知闭环 P0 与 P1-A 生效知识检索：工作区与会话、Ollama 本地流式对话、执行详情，以及知识草案、审核确认、来源和版本历史。数据保存到本机 SQLite。知识图谱支持关系修订、3D 点选/聚焦、筛选和视图保存；执行图展示真实事件、上下文快照和输出，支持定位具体知识版本与原消息。

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
4. 从回答下方打开“执行过程”，查看实际事件、生成配置和上下文消息定位。当前使用最近的完整会话轮次及你显式选择的已确认知识，不使用文件检索。

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

默认自动检查使用可控本机测试服务覆盖错误分支，不能代替真实模型验收。测试不会读取正式工作区数据。当前通用备份恢复界面、导出、删除与安装包尚未提供（升级前自动创建一致性备份）；数据目录可在设置中查看，完整限制见里程碑记录。

## 使用知识草案

在回答中选中文字后点击“保存为知识”；未选择文字时取回答开头，最多 20000 字。填写标题，可改写正文，保存后进入知识页。手动记录可直接使用“新建知识”。

保存只创建草案。点击“审核并确认”并检查全文后，确认该版本生效；继续修改时，旧生效版本保留到再次确认。知识页可筛选、搜索标题、查看版本和打开原会话。确认表示用户审核，不代表事实验证；知识通过对话输入区的“本次上下文”显式选择，不会自动加入。支持已确认的知识、背景和决定；新草案不替代旧生效版。

编辑时取消、Esc 或正常关闭窗口会提示保存/放弃/继续编辑。强制结束进程仍可能丢失未保存编辑。数据库首次升级会在数据目录保留 before-migration-2-*.sqlite3，一般无需手动操作；旧版应用不兼容升级后的数据库。

## 知识图谱

进入“图谱 → 知识关系”，默认读取当前工作区。左侧列表或画布均可选择节点，右侧复用知识详情、版本历史与草案审核。点击“添加关系”连接同工作区的两个节点，修改与停用均保留关系历史；关系指向稳定节点，节点内容更新后仍需自行复查关系。

拖动旋转、右键拖动平移、滚轮缩放，也可使用“聚焦节点”和“适应全部节点”。高级位置表单可移动节点；点击“保存视图”保存视角与布局，移动位置不会创建知识版本。未保存视图在离开页面后可能丢失。“恢复已保存视图”将放弃当前未保存布局。

“7 节点演示”独立于工作区，不写入数据库。WebGL 不可用时可继续使用节点列表和知识编辑。首批针对小图验证；大图和模型同时生成的性能在 Phase 3 测量，不承诺千节点性能。

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


## 让知识参与回答（P0-A）

在对话输入区展开“手动选择”，刷新知识列表并勾选所需资料；输入问题后可预览版本、正文和预算。发送时再次校验生效版本。版本已变化时问题会保留，刷新列表、取消并重新勾选后再发送。选择在当前应用会话内按工作区/会话保留，重启后需重新选择；已执行运行的依据和快照永久保存在本地数据库。

回答旁“执行过程”显示本次知识版本、正文及完整请求快照。模型检查、请求尝试、服务响应和结束分别记录；这些是外部执行事实。历史运行没有完整快照时明确说明，不事后生成历史依据。快照记录实际 HTTP 请求，模型权重仅按标签使用，不能保证未来逐字重现。知识纳入上下文不等于回答已验证；手动选择与P1-A自动检索分别记录。

真实知识上下文验收（使用独立测试数据库）：

```powershell
cd apps/desktop
$env:CORTEXOS_REAL_CONTEXT='1'
npx.cmd playwright test --project real-context
Remove-Item Env:CORTEXOS_REAL_CONTEXT
```

回答旁点击“3D 执行轨迹”，从左侧列表或画布选节点，右侧查看内容、关系和审计数据。知识节点定位当次使用的版本；消息节点定位原消息，可返回原运行。生成中的运行自动更新，已保存记录在模型离线时仍可查看。“保存执行视角”保存相机；未保存视角只在当前应用进程内保留。

P0-B 与 P1-A 已完成；下一阶段为 P1-B 授权来源与版本证据，按 [增量计划](docs/refactoring-plan.md) 在当前切片结束后等待确认。


## 参考图对话界面

AI对话页采用浅色侧栏、集中欢迎区和宽输入框；对话生成后保留底部输入与实际执行入口。设计依据、组件结构和截图差异见 [UI规范](docs/design/ui-spec.md)、[组件映射](docs/design/component-map.md) 与 [视觉验收](docs/design/visual-review.md)。知识、图谱和设置页面保留现有布局。


## 自动检索已确认知识（P1-A）

会话默认开启“自动检索知识”，仅查当前工作区的生效知识版本；可关闭，重启后保持。首次在无会话状态切换时会建立空会话并保留草稿。新会话仍默认开启。

“手动选择”优先于自动候选；可点击“预览上下文”查看本次命中和排除原因，发送时重新检索并保存精确请求。回答的“执行过程”和3D中的“知识检索完成”节点可查看实际结果，旧请求不随知识更新改变。当前是中文双字词/英文术语的词法匹配，单字中文和同义表达可能不命中；尚未支持文件检索。策略、预算与边界见 [ADR 0008](docs/ADR/0008-effective-knowledge-retrieval.md)。
