# Windows 内部交付记录

2026-10-22，六步计划第5项。状态：内部安装包与自动验证部分已交付，人工验收待完成；不进入Decision Lab。范围决策见ADR/0017-windows-internal-delivery.md。

## 安装包

正式标识com.cortexos.desktop，版本0.1.0，Windows x64 Release，当前用户安装，简体中文/英文。文件：`apps/desktop/src-tauri/target/release/bundle/nsis/CortexOS_0.1.0_x64-setup.exe`，2,902,672字节（约2.77MiB）。

SHA-256：`108e763c7c76aad9c573253b847d9b8a95600e70a779f2c3da37840316d2b691`。

Authenticode：NotSigned，内部开发包。没有公开发布、自动更新、Ollama或模型捆绑。依赖/模型再分发许可、签名与面向用户的通用备份恢复仍未完成，不作为公开测试版本。默认WebView2引导程序在缺少运行时时需要联网；已有运行时可离线安装应用。没有实测缺少运行时的干净系统。

`artifacts/windows-delivery-release/manifest.json`记录实际大小、哈希和验证边界。构建来自0823637及本轮交付配置，最终源码提交见Git和里程碑。NSIS官方构建工具下载到已有Tauri缓存并校验哈希，没有安装系统软件或新增项目依赖。两个锁文件未改。

## 已验证与待验证

| 项目 | 证据 | 结果与边界 |
| --- | --- | --- |
| 正式Release包 | 类型检查、Vite、优化Rust及NSIS构建，哈希/签名读取 | 构建通过；正式Release本身的安装、启动与交互未运行 |
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

## 人工验收表（全部待执行）

推荐在独立Windows测试账号中运行正式安装包，避免正式已有数据参与验收。应用未提供通用备份恢复界面；不要以旧版程序直接打开升级后的正式数据库。记录实际版本、缩放、窗口尺寸、操作结果及截图/读屏反馈，失败时保留数据和错误。

1. **正式Release启动**：安装上方包，检查语言和安装目录；启动后新建工作区，完成一次本地回答，确认部分停止输出、知识草稿/审核、来源查看和图谱可用。退出重开核对这些记录。首次正式发行只有0.1.0；真实旧发行包升级兼容尚无样本。
2. **系统150%**：方便时在Windows显示设置将缩放设为150%，重新打开应用。检查对话输入/发送、知识编辑/版本历史、图谱列表/详情和设置保存；按钮及关闭入口可达、正文可滚动，记录截图。结束后恢复原设置。不要用浏览器缩放或CDP代替。
3. **鼠标窗口操作**：拖动顶栏空白区域，窗口跟随；双击同一区域最大化/还原；拖动边缘缩放，最小化后从任务栏恢复。确认未保存草稿仍在，关闭编辑时出现保护提示。多显示器切换如有条件另验。
4. **真实读屏**：选择Windows讲述人或已有读屏软件，用Tab/Shift+Tab/Enter/Escape完成工作区创建、问题发送/停止、执行记录开关、知识编辑和历史关闭；确认控件名称正确、焦点可见且返回合理。流式内容不逐字播报，开始/结束/失败可感知。记录软件版本、反馈和失败位置。
5. **真实模型长时**：固定qwen3:4b-instruct、4096上下文、输出512、温度0.3、单生成，连续使用至少30分钟，期间切页/操作图谱/取消；再单独试2048输出。记录实际输出、耗时、CPU/GPU/显存、部分失败和恢复。仅在专用测试服务中试主动停服务，不终止其他任务使用的服务。

没有把本轮60秒合成流当成第5项长期验收。此前1000节点/5000关系观测和真实512/2048结果沿用graph-reading、streaming-performance中的设备/负载边界；10,000节点/20中心性能和旧高显存超时根因仍无新结论。人工项完成并处理失败后，再决定第5项通过与进入Decision Lab；LoRA仍后置。
