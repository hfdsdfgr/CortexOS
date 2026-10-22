# HTML 参考界面规范

2026-10-22。用户明确要求用 `reference/CortexOS 3D_ Full Prototype(1).html` 完全替换此前视觉设计。此规范取代 V3 的视觉方向；原业务边界、数据真实性和可打断图谱操作继续有效。

## 参考与落地

直接读取 HTML 的 CSS 与布局，并用 Edge 打开四页截图对照；参考的外部 Google Fonts 请求在检查中阻止，不引入线上字体依赖。参考配色：背景 #EEF1F7、蓝雾 #DAE2FB、绿雾 #D4EEE8、主文字 #1B2230、强调 #4F5BD5、知识青绿 #4FB6A8。采用本地字体回退，中文使用系统 UI 字体。

外层16px留白与16px区域间距；侧栏252px，聊天正文最大720px，依据栏336px；知识页列表290px，设置页200px标题列与最大640px表单。浅色半透明玻璃、20px面板圆角、12px条目圆角和胶囊按钮均来自参考。暗色使用参考的深蓝绿背景；字体普通/中/粗权重从400/500/600调整至380/450/500，避免系统中文字体在550时匹配到过粗字重。深色强调色为可读性调整至#7F8BFF，非逐像素不加判断地照抄。

现有功能比参考多，使用相同控件和折叠详情容纳，不删除审核、对比、来源、检索、运行、跨页定位、视图保存、错误或草稿保护。演示冲突、向量检索、重排器、虚构统计及Git式提交不接入正式界面。依据栏只显示既有get_run返回的当次知识和估算量，SVG连线只表示纳入本次请求。

## 五项细节

1. 主层级靠参考背景与1%–3%的细微表面叠色，玻璃使用细高光而非粗边框；输入框内高光与外环分开，聚焦增加双层阴影。
2. 外观支持浅色、深色、跟随系统，偏好保存在本机；暗色降低文字权重，图谱配色随主题同步。
3. 仅新到达的回答片段以小范围blur/opacity依次呈现，已显示正文不反复播放，输入编辑与引用原始偏移不变；按钮图标用统一盒子和居中排列。
4. UI数字使用tabular-nums，容量和计数保留稳定空间；网格用minmax与断点适应窗口，标题balance、正文pretty并保留中文断行。
5. 窗口拖动复用系统能力，反馈采用短时弹性运动，成功提示2500ms自动消失；错误、待处理和未保存状态保留。减少动态效果时取消模糊/弹性，图谱镜头继续遵循独立用户选项。

## 文件与验收

重建AppShell和统一样式入口，保留页面业务组件与后端接口。新增AppearanceControl、Toast、ChatEvidence，调整Chat/Markdown呈现并复用现有模型/会话/知识逻辑。旧多层覆盖CSS退出运行入口。仅前端和文档变化，Rust/迁移/模型请求逻辑不改。

验证先类型与构建，再浏览器实际截图；检查1366×768、1600×900、1920×1080、窄窗和深色，最后选择必要原生专项覆盖聊天Markdown、上下文引用、知识版本、来源与图谱。按用户要求不跑单元或无关全量测试。实际结果写入milestone-log。完成后停在本轮UI验收，不推进Decision Lab。

## 实际文件结构

| 范围 | 文件与作用 |
| --- | --- |
| 样式 | `src/styles/tokens.css`、`layout.css`、`controls.css`、`features.css`、`motion.css`；`src/markdown.css`保留安全Markdown排版并采用新Tokens |
| 外壳 | `components/AppShell.tsx`重建252px侧栏、统一导航/会话、工作区、窗口控件与窄窗抽屉；保留全部已有操作 |
| 共享呈现 | 新`AppearanceControl.tsx`、`Toast.tsx`、`ChatEvidence.tsx`；调整`EmptyState.tsx`与原有对话组件装配 |
| 回答 | `Chat.tsx`、`AnswerContent.tsx`、`MarkdownContent.tsx`；实际依据、8字素片段渐显、原文及引用偏移保留 |
| 原有功能 | `App.tsx`、`Graph.tsx`、`Knowledge.tsx`、`SourceBrowser.tsx`只接统一成功反馈；`Settings.tsx`将保存成功统一为2500ms提示；失败/草稿/保存状态继续保留 |
| 三维主题 | `GraphViewport.tsx`观察主题属性，重读颜色并按需绘制，不重建相机或改领域数据 |
| 检查 | 新`tests/prototype-ui.spec.ts`；已有浏览器/聊天/知识布局/图谱/上下文检查适配新的可访问入口和布局；`tsconfig.json`补标准Intl字素API类型，未新增依赖 |

以上路径相对`apps/desktop/`。删除旧`App.css`、`chat-design.css`、`knowledge-design.css`、`compact-shell.css`、`source-browser.css`、`workspace-design.css`、`design-tokens.css`、`graph-design.css`、`workspace-v3.css`，避免继续叠加历史覆盖。

## 验证结果与差异

类型检查、Vite及Windows调试桌面构建通过。9项不同的原生专项与7项浏览器检查分别通过，详细命令和失败后的修正记录见milestone-log；不是一轮全量测试或单元测试。最终原生截图目录为本机`artifacts/prototype-ui-context-final/prototype-ui-HTML-referenc-60f8a-y-and-responsive-navigation-desktop`；浅/深主题×4页×3尺寸共24张，另有800/375窄窗图。已审阅前轮同布局24张联系表及代表原图，最终截图用于核对最后构建。

`artifacts/prototype-ui/layout-comparison.json`记录1600×900浏览器下参考与实际的侧栏252、输入框720、依据栏336px一致。未伪造像素相似度。正式数据/模型未参与检查，HTTP服务和知识为隔离合成输入，真正执行请求、保存和读取由桌面代码完成。

参考英文示例替换为实际中文内容；字体使用本机回退，未下载参考的Google Fonts。主图保留真实3D和所有已有操作，依据小图投影实际请求，不搬入模拟执行、虚构冲突或Git提交。额外的窗口、外观、来源与审核入口会产生必要差异，不能声称逐像素完全相同。数学公式/语法着色、系统150%、真实读屏、长期真实模型/超长流式渲染性能和新安装包仍未在本轮验收；既有Vite大块提示保留。已发布v0.1.0不替换。
