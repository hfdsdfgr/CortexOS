# CortexOS desktop

从本目录运行：

```powershell
npm.cmd ci
npm.cmd run dev          # 仅浏览器预览
npm.cmd run tauri -- dev # Windows 桌面
npm.cmd run build
npm.cmd run test:smoke
```

完整环境、架构和实际验收结果见根目录 README 与 `docs`。Phase 0 只提供页面导航，尚未接入模型、数据库或 3D。
