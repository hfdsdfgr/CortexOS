# CortexOS desktop

从本目录运行：

```powershell
npm.cmd ci
npm.cmd run dev          # 仅浏览器预览
npm.cmd run tauri -- dev # Windows 桌面
npm.cmd run build
npm.cmd run test:smoke
```

完整环境、首次使用和实际验收结果见根目录 README 与 `docs`。Phase 1 已接入本地模型、SQLite 会话与执行详情；知识编辑和 3D 尚未提供。运行桌面自动检查前执行 `npm.cmd run tauri -- build --debug --no-bundle`。
