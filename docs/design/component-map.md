# 对话页组件映射

React + TypeScript；使用现有React、lucide-react、Tauri API与CSS，无新增UI框架或依赖。

```text
App（useStudio、路由、工作区及知识编辑弹窗）
└─ AppShell
   ├─ Sidebar
   │  ├─ WorkspaceSwitcher
   │  └─ ConversationList
   ├─ TopBar → ModelStatus
   └─ ChatPage（滚动、当前运行、复制及重命名协调）
      ├─ EmptyState / ChatMessage[]
      ├─ ChatComposer → ContextPicker
      └─ CognitiveInspector
```

| 组件文件（apps/desktop/src/components） | 复用与职责 |
| --- | --- |
| AppShell.tsx | 外壳、TopBar、窄屏导航抽屉；其他页面保留原header/nav |
| Sidebar.tsx | 真实导航、工作区组、会话组与本地品牌身份 |
| WorkspaceSwitcher.tsx | 从App提取；原studio.openWorkspace/createWorkspace弹窗行为 |
| ModelStatus.tsx | 原health/checking状态呈现与设置链接 |
| ConversationList.tsx | 从Chat提取；新建、选择、运行标记、空列表 |
| ChatMessage.tsx | 原消息呈现、复制、摘录保存、重试、执行/3D入口 |
| ChatComposer.tsx | 原输入/发送/取消、IME保护、模型入口和上下文选择 |
| EmptyState.tsx | 欢迎态、建工作区与连接模型的下一步 |
| CognitiveInspector.tsx | 原RunInspector独立成文件，真实事件和快照 |

AppShell与TopBar同文件因后者仅承担很小的外壳栏；其余按独立行为拆分。业务状态仍由studio.ts负责，组件通过props协调。ContextPicker保留原文件与接口；数据库、Rust命令、知识引擎、图谱模块均无行为改动。

设计系统入口：chat-design.css；加载在App.css之后，所有新增外观限制在对话外壳作用域。无参考整图背景、网络字体或第三方图像资源。

## 本轮文件清单

- 修改：`apps/desktop/src/App.tsx`、`apps/desktop/src/Chat.tsx`（接入外壳与拆分组件）。
- 新增：`apps/desktop/src/chat-design.css`，上述components目录9个文件（AppShell文件同时导出TopBar，共10种组件）。
- 检查：新增`apps/desktop/tests/chat-design.spec.ts`；修改`apps/desktop/tests/app.spec.ts`和`apps/desktop/playwright.config.ts`。
- 文档：`docs/design/ui-spec.md`、`component-map.md`、`visual-review.md`；更新`docs/development-standards.md`、`docs/implementation-plan.md`、`docs/milestone-log.md`和README。
- 参考：用户提供的`docs/design/reference/ai-chat.jpg`保留为设计依据；document-history.jpg不在本轮使用范围。
- 本地截图：`artifacts/ui-chat/`沿用忽略规则，不加入应用资源。

本轮未改Rust、数据库迁移、studio.ts、知识引擎或3D模块。工作区中用户自身的AGENTS.md改动保持原样，不纳入此UI提交。
