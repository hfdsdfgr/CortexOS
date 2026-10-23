# Windows 发布与验收记录

## v0.2.0 当前交付（2026-10-23）

本版按用户要求发布当前工作台界面与交互优化，下载入口为 [v0.2.0](https://github.com/marksimZ/CortexOS/releases/tag/v0.2.0)。正式标识仍为`com.cortexos.desktop`，Windows x64、当前用户安装；不改变数据库结构，不包含Ollama或模型，未启用自动更新。

正式包为`CortexOS_0.2.0_x64-setup.exe`，2,948,478字节，SHA-256：`b3a18e39b590c2615b024293e172e434949b263daf37cd7d122ff8c71a9ed1eb`；发布页同时提供`SHA256SUMS.txt`。安装包未签名，缺少WebView2的设备需由安装器联网获取运行时。正式Release/NSIS构建通过，程序ProductVersion为0.2.0；随后直接启动正式exe，Windows UI Automation找到前端“关闭窗口”按钮并通过它正常退出，未编辑工作区或调用模型。这项启动检查不等于正式安装包已完整人工验收。

安装检查使用独立产品名CortexOS Delivery Check与`com.cortexos.deliverycheck`，在仓库artifacts中完成0.1.0→0.2.0安装升级、数据前后快照及卸载，1/1通过（24.8秒）。安装/卸载退出码均为0，实际安装程序版本匹配，全部表及图数据在升级前后相等，卸载保留检查数据。两包来自本轮相同源码，版本由测试配置覆盖；这验证安装器及数据保留流程，不等于已测试历史正式0.1.0安装包升级。6→7迁移使用合成库，迁移前备份与旧库逐表一致，完整性和外键通过，不读取正式用户数据。

UI功能检查沿用本轮已通过的三项浏览器与四项原生专项，并复核最终菜单版本；安装环节不重复运行单元或全量检查。检查后已恢复正常开发程序标识，正式包校验值未变。证据位于`artifacts/release-v0.2.0/install-check`和`production-window-evidence.json`；这些本地合成检查产物不随发布上传。2026-10-23，用户确认已在Windows150%系统缩放下验证所有功能，反馈无问题，该项记为用户验收通过。此结果来自用户实际反馈，不是自动化检查或新增截图；真实读屏、干净系统和长期真实模型负载仍待人工验证。具体新命令和产物见[本轮里程碑](milestone-log.md)。

## v0.1.0 历史交付记录

2026-10-22，当前发布为 [v0.1.0 预发布版](https://github.com/hfdsdfgr/CortexOS/releases/tag/v0.1.0)。仓库及资产已公开，安装包与 SHA256SUMS.txt 可直接下载。标签指向 b7ad41779f28649032ee31c51d66f5a06807f2d2；未启用自动更新。用户安装步骤见 [开始使用](getting-started.md)，本页保留开发验证证据与人工验收边界。

2026-10-22，六步计划第5项。状态：安装包与自动验证部分已交付，人工验收待完成；不进入Decision Lab。范围决策见ADR/0017-windows-internal-delivery.md。

## 安装包

正式标识com.cortexos.desktop，版本0.1.0，Windows x64 Release，当前用户安装，简体中文/英文。文件：`apps/desktop/src-tauri/target/release/bundle/nsis/CortexOS_0.1.0_x64-setup.exe`，2,949,609字节（约2.81MiB，包含本日Markdown、420ms镜头偏好与首帧计时修复）。

SHA-256：`1c067bed99cf0e22a738272a067a36eaad3d5f30fe682d09f6fa1d24825d3c23`。

Authenticode：NotSigned，公开预发布包；没有自动更新、Ollama或模型捆绑。依赖分发许可审查、项目许可证选择、签名与通用备份恢复仍未完成，当前不作为稳定版本。默认WebView2引导程序在缺少运行时时需要联网；已有运行时可离线安装应用。没有实测缺少运行时的干净系统。

`artifacts/windows-delivery-release/manifest.json`记录实际大小、哈希和验证边界。当前发布包功能基线为 b7ad417（包含 Markdown、420ms 镜头偏好与首帧计时修复）；较早的安装检查来自当时的同源伴随包，不能混作最终包全量验收。NSIS官方构建工具下载到已有Tauri缓存并校验哈希，没有安装系统软件或新增项目依赖。两个锁文件未改。

## 已验证与待验证

| 项目 | 证据 | 结果与边界 |
| --- | --- | --- |
| 正式Release包 | 类型检查、Vite、优化Rust及NSIS构建，哈希/签名读取 | 构建通过；随后按用户要求直接启动正式Release exe，原生窗口可见，交互由用户验收中；正式安装包尚未安装 |
| 实际安装/版本升级/卸载 | 独立产品名CortexOS Delivery Check、com.cortexos.deliverycheck，仓库artifacts内安装；0.0.9→0.1.0 | 安装退出0、实际安装文件版本匹配；默认卸载退出0且应用文件删除、隔离数据保留；不覆盖正式安装项 |
| 升级前后数据 | 全表记录数与内容哈希、完整GraphData相等 | 两条消息、一次运行及真实事件/请求快照、四条知识版本（含旧生效版和新草稿）、审核、两条关系版本、一份来源副本、位置及相机保留；包括完整性和外键检查 |
| 数据库6→7 | 本仓库迁移脚本建立合成6版库，再由实际已安装应用升级 | 升级后7版，原知识/工作区逐项相等；升级前VACUUM备份与原库全表哈希一致，完整性/外键通过；不是正式用户库 |
| 窗口与键盘 | 已安装应用真实HWND用SetWindowPos缩放；聚焦最大化/还原按钮按Enter | 宽高实际变化，内容无横向溢出；不是CDP视口模拟，也不是鼠标拖动实测 |
| 可访问树 | WebView2 Accessibility.getFullAXTree | 问题输入、发送、新工作区、最大化具有名称；不代表NVDA/讲述人朗读实测或完整键盘覆盖 |
| 流式及恢复 | 独立HTTP服务，持续流60秒后取消，实际连接销毁、格式错误、30秒超时、关闭与强制中断后重启 | 部分回答和终态保留，真实运行失败/中断事件及重试通过；不是长期真实模型稳定性 |
| 系统缩放 | GetDpiForWindow=120，WebView2 DPR=1.25 | 当前环境125%；150%保持待验收。用户明确选择保留系统设置并提供人工表 |

两个检查安装包来自同一份当前源码，仅覆盖版本不同；这是安装器版本升级的真实冒烟，不能声称历史发行代码兼容。伴随包使用debug构建，允许已有的隔离数据、合成本地服务及CDP入口。正式Release的这些测试入口被`cfg(debug_assertions)`排除（lib.rs、commands.rs、ollama.rs），没有为本轮新增生产调试后门。正式运行与伴随包的证据分别报告。

原生截图已生成并查看：`artifacts/windows-delivery-final/windows-delivery-isolated--6c075-a-and-migrates-a-v6-fixture-delivery/installed-native-window.png`。该截图是已安装调试伴随包实际窗口，记录当前物理像素与125%环境，不冒称150%。`delivery-evidence.json`记录版本/哈希、窗口矩形、表哈希和备份结果。60秒流与异常恢复见`artifacts/windows-delivery-acceptance`的隔离数据库、controlled-stream-evidence.json及实际失败恢复截图。

## 可重复操作

在`apps/desktop`目录，使用现有工具：

```powershell
npm.cmd run tauri -- build --debug --bundles nsis --config tests/fixtures/delivery-previous.json
npm.cmd run tauri -- build --debug --bundles nsis --config tests/fixtures/delivery-current.json
npm.cmd run tauri -- build --bundles nsis
# 恢复默认开发程序的正式标识；release文件仍保留。
npm.cmd run tauri -- build --debug --no-bundle
$env:CORTEXOS_DELIVERY_CHECK='1'
$env:CORTEXOS_CHAT_SOAK_MS='60000'
npx.cmd playwright test windows-delivery.spec.ts chat.spec.ts --project delivery --project desktop --output ../../artifacts/windows-delivery-recheck
Remove-Item Env:CORTEXOS_DELIVERY_CHECK
Remove-Item Env:CORTEXOS_CHAT_SOAK_MS
```

检查只使用隔离数据；安装器会写当前账号的专用检查安装项，使用`/NS`跳过快捷方式。使用新的产物目录以保留上次证据。`delivery-db.py`只接受仓库artifacts内的数据库，使用Python标准库，seed拒绝覆盖既有库。正常卸载保留检查库以供审计；未提供永久删除行为。

## 人工验收表（状态更新于2026-10-23）

系统150%缩放已由用户验收通过；其余项目继续保留各自的验证范围。上方v0.1.0历史记录反映当时状态，当前结果以本表和本页v0.2.0记录为准。

推荐在独立Windows测试账号中运行正式安装包，避免正式已有数据参与验收。应用未提供通用备份恢复界面；不要以旧版程序直接打开升级后的正式数据库。记录实际版本、缩放、窗口尺寸、操作结果及截图/读屏反馈，失败时保留数据和错误。

1. **正式Release启动**：安装本页0.2.0包，检查语言和安装目录；启动后新建工作区，完成一次本地回答，确认部分停止输出、知识草稿/审核、来源查看和图谱可用。退出重开核对这些记录。正式0.2.0程序启动与正常关闭已检查；干净环境安装及历史正式0.1.0包升级仍待专项验收。
2. **系统150%：已通过（用户验收）**。2026-10-23，用户确认在150%系统缩放下已验证所有功能，反馈无问题。未补充具体窗口尺寸或截图，本记录仅按实际反馈确认该缩放项通过。
3. **鼠标窗口操作**：拖动顶栏空白区域，窗口跟随；双击同一区域最大化/还原；拖动边缘缩放，最小化后从任务栏恢复。确认未保存草稿仍在，关闭编辑时出现保护提示。多显示器切换如有条件另验。
4. **真实读屏**：选择Windows讲述人或已有读屏软件，用Tab/Shift+Tab/Enter/Escape完成工作区创建、问题发送/停止、执行记录开关、知识编辑和历史关闭；确认控件名称正确、焦点可见且返回合理。流式内容不逐字播报，开始/结束/失败可感知。记录软件版本、反馈和失败位置。
5. **真实模型长时**：固定qwen3:4b-instruct、4096上下文、输出512、温度0.3、单生成，连续使用至少30分钟，期间切页/操作图谱/取消；再单独试2048输出。记录实际输出、耗时、CPU/GPU/显存、部分失败和恢复。仅在专用测试服务中试主动停服务，不终止其他任务使用的服务。

没有把本轮60秒合成流当成第5项长期验收。此前1000节点/5000关系观测和真实512/2048结果沿用graph-reading、streaming-performance中的设备/负载边界；10,000节点/20中心性能和旧高显存超时根因仍无新结论。人工项完成并处理失败后，再决定第5项通过与进入Decision Lab；LoRA仍后置。

## 2026-10-22 用户现场验收启动

用户要求弹出程序亲自验收。直接启动target/release/cortexos-desktop.exe（0.1.0），未使用测试环境覆盖；进程存活，原生窗口标题为“CortexOS — 本地认知工作台”，IsWindowVisible=true。ShowWindowAsync已显示窗口，Windows拒绝SetForegroundWindow抢前台（返回false），如在其他窗口后可从任务栏切入。没有自动关闭程序、修改系统缩放或操作用户内容。仅证明进程与原生窗口启动，不代表正式安装包安装、页面加载、模型响应或人工清单已通过；等待用户反馈。

## 本日验收修复后的包更新

Markdown及慢速聚焦修复后重新构建同版本内部Release，当前文件大小/哈希已更新。首轮内部包为2,902,672字节，旧哈希108e763c7c76aad9c573253b847d9b8a95600e70a779f2c3da37840316d2b691，原安装升级证据来自该轮同源调试伴随包；本轮没有重跑安装升级，不能把旧证据当作新包安装验证。新Release原生窗口已按用户要求重新启动并确认可见，等待用户检查Markdown与镜头手感；Windows未允许抢占前台，可从任务栏打开。

## 镜头复验后最终包（同日）

最终420ms包为2,949,609字节，顶部哈希已更新。本轮明确平滑/跟随系统/立即选项，从实际首帧计时并验证真实相机中间位置；旧1.1–1.6秒中间包不再交付。先前Markdown包2,948,332字节，哈希cb7a1f33a1ca622aaa9a93713ee743bcf223158249d7a879043b04cc7de98ca0，仅为历史记录。当前Release已重新启动且窗口可见，Windows未允许抢占前台，可从任务栏切入；仍等用户手感验收。安装升级、系统150%及读屏未因本轮构建自动通过。
