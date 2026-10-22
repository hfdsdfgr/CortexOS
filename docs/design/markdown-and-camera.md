# 对话 Markdown 与镜头验收修复

2026-10-22，用户反馈纯文本回答与过快聚焦；属于Windows交付验收修复，不进入Decision Lab。沿用V3与现有状态/持久化，仅修改呈现和相机时长。

## 对话行为

`MarkdownContent.tsx`供用户消息、模型回答和输入预览复用。支持标题、粗斜体、删除线、引用、列表/任务列表、分隔线、行内/围栏代码和表格。代码使用本地等宽字体，长代码与表格在自身区域滚动，保留中文排版。未增加数学公式、代码语法着色或富文本编辑器。

输入仍用原textarea编辑Markdown原文，眼睛图标切换预览，铅笔返回编辑；切换保持草稿并转移焦点。发送原文，预览状态不会跨工作区/会话串用；发送后回到编辑。Enter发送、Shift+Enter换行和输入法组合规则不变，说明沿用原折叠入口，不增加常驻灰字。

回答动作新增“原文/排版”，复制仍复制原始Markdown。保存整条回答为知识仍使用原文；选取普通连续文字仍可保存，选取跨越格式标记而无法在原文中定位时明确提示切换原文再选，不静默替换成整条回答。源文、模型请求、引用报告与数据库结构保持不变。

## 引用和安全

保留原引用检查服务与历史定位。AST转换只在普通文字叶节点中，用原始UTF-16偏移和实际标签逐项校验；用标准转义解码处理前缀转义/字符实体，不以渲染文字伪造来源。粗体、表格、中文及emoji前缀可点击；代码和Markdown链接内的标记保持字面呈现，不生成嵌套交互按钮，原始引用报告仍保留。错误引用原有反馈和抽屉继续可用。

使用固定版本react-markdown10.1.0、remark-gfm4.0.1及micromark-util-decode-string2.0.1，标准解析器替代手写Markdown。核对实际npm元数据及[react-markdown官方说明](https://github.com/remarkjs/react-markdown)、[remark-gfm官方说明](https://github.com/remarkjs/remark-gfm)。未启用原始HTML解析或dangerouslySetInnerHTML；原始HTML显示为文字。链接仅允许http/https/mailto，使用noopener/noreferrer；桌面外链实际打开未专项验收。图片仅显示替代文字，不自动下载网络图片；不新增Tauri权限、云端服务或模型调用。

新增依赖带来实际体积成本：主块371.65→530.32kB，gzip111.78→160.51kB；图谱块约940.90kB。现有500kB提示仍在，主块也出现提示。不声称性能优化；本轮未做真实模型长回答解析性能或超长Markdown专项。

## 镜头行为

`GraphCamera.tsx`先曾改为1100–1600ms；用户随后明确要求恢复初版时长，当前固定420ms，保留五次平滑曲线。首次聚焦、节点切换、返回/适应/重置使用同一入口；新的选择从实际当前位置开始，保留最初探索快照。原滚轮/拖动/新聚焦中断和Esc/恢复规则保留。知识图“图例与操作”和执行图“图例与记录说明”复用GraphMotionControl，默认平滑（0.42秒）；跟随系统模式才遵循减少动态效果，另可选择立即切换。复用studio的本机偏好读写，跨页/重载保留；存储不可用时保留当前会话选择，无新表/权限。

## 验证与边界

必要原生WebView2检查：Markdown输入预览/返回/发送、未闭合代码流式输出、排版与原文、UTF-16引用/错误引用/转义、脚本与危险URL无执行、网络图片无请求、存为知识及重启；旧引用历史、批量图形选取/位置/恢复和真实执行图兼容。实际检查命令与结果见milestone-log；没有运行单元或全套测试。

已查看1366×768、1600×900、1920×1080内容视口的原生预览截图及回答顶部截图，未横向溢出；图片为真实应用，不是静态背景。截图：artifacts/markdown-camera-first/markdown-camera-native-Mar-77785-e-text-and-citation-offsets-desktop/markdown-*.png；顶部与选取保护补验在artifacts/markdown-final。

相机非减少动态模式验证中途未提前打开详情、快速切换以最后选择为准、拖动/滚轮打断、空闲停止绘制和减少动态效果。最初实测点击至详情显示1351.9/1224.2ms（含操作/IPC，非纯动画时间），最终拖动补验约1327.3/1264.1ms，记录在camera-drag-final；camera-final首次手势命中顶部状态条而失败，调整至断言实际命中canvas的空白点后通过。人工仍需评价手感；不是系统缩放、完整读屏、长期真实模型或安装升级的重新验收。


## 用户复验：瞬间聚焦与初版时长（同日补充）

用户报告仍瞬间完成，随后明确“动画时间恢复初版”。最终420ms，不保留慢速分支。发现旧代码的系统偏好分支可以完全跳过动画，且计时从调用时开始可能被首帧前工作耗尽；现在显式平滑不会被媒体查询跳过，并从实际第一帧开始计时。

证据边界：SystemParametersInfo(SPI_GETCLIENTAREAANIMATION=0x1042)只读成功、值为false；但隔离WebView2未仿真时的prefers-reduced-motion为false。两种读数不同，未读取旧正式页面的媒体查询，不能断言系统开关就是用户原窗口的唯一原因。字段含义已对照[Microsoft API说明](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfoa)。本轮同时覆盖两种媒体偏好和首帧延迟，未修改Windows设置。

GraphViewport在原有隐藏的绘制观测旁记录实际camera.position，用于验证相机本身的插值，而非只等待详情出现。新增场景在reduce下默认平滑，检查120ms的相机位置严格位于起终点之间；跟随系统/reduce和明确立即模式在200ms内完成；模拟首帧前500ms同步工作后仍有中间位置；新聚焦/拖动/滚轮可打断、空闲停止绘制、偏好重载及三尺寸截图。该500ms是隔离回归输入，不代表真实设备性能结论。最终结果见milestone-log和artifacts/camera-420-final。
