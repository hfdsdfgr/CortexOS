# CortexOS 3D

**把对话、知识和回答依据留在本机的 AI 认知工作台。**

CortexOS 将本地模型对话、可审核的知识库和 3D 图谱放在同一个工作区。你可以整理项目资料，检查一次回答实际用了什么内容，把有用的结论保存为知识，再追溯它的来源与修改历史。

[下载 v0.1.0](https://github.com/hfdsdfgr/CortexOS/releases/tag/v0.1.0) · [开始使用](docs/getting-started.md) · [使用指南](docs/user-guide.md) · [开发路线](docs/roadmap.md) · [文档目录](docs/README.md)

> 当前为 Windows x64 预发布版，安装包未签名。Ollama 与模型需单独安装；通用备份恢复、Decision Lab 和评估仍在计划中。

## 能做什么

| 模块 | 当前能力 |
| --- | --- |
| AI 对话 | 本地 Ollama、流式回答、停止与重试、Markdown 输入预览及回答排版、会话持久化 |
| 知识管理 | 从回答或文件摘录建立草稿、人工确认、生效版本、修改历史与版本对比 |
| 资料文件 | 明确选择 UTF-8 TXT/Markdown 文件，保存文字副本及版本，按行查看来源 |
| 回答依据 | 自动查找当前工作区已确认知识，支持手动选择，保存实际请求与知识版本 |
| 知识图谱 | 浏览真实节点和关系，筛选、展开直接关联、多中心探索、关系修订与视图保存 |
| 执行轨迹 | 从回答追溯上下文组装、知识检索、模型调用及输出等实际事件，跨页定位原记录 |

知识图谱展示长期知识与关系；执行图谱展示某次回答的实际处理过程。系统记录可观察的执行事实，不声称读取模型内部隐藏的思维链。引用位置可找到，也不等于论断已经核实。

## 开始使用

1. 从 [Releases](https://github.com/hfdsdfgr/CortexOS/releases) 下载 `CortexOS_0.1.0_x64-setup.exe` 并安装。
2. 安装并启动 [Ollama](https://ollama.com/download/windows)，在 PowerShell 下载模型：

   ```powershell
   ollama pull qwen3:4b-instruct
   ```

3. 打开 CortexOS，创建工作区，在「设置」检测连接并选择本地模型，然后开始对话。

应用只连接 `http://127.0.0.1:11434`。已保存的会话、知识和处理记录可离线查看；生成新回答需要本地模型服务。模型下载需要联网，安装包不附带模型权重。

完整步骤、安装包校验和数据备份方式见 [安装与首次使用](docs/getting-started.md)。

## 一次完整的工作流程

**提问 → 查看依据 → 保存知识草稿 → 检查并确认 → 继续提问。**

在回答下方打开执行记录，核对模型配置、使用的知识版本和实际请求。将有用片段保存为知识，确认后即可参与之后的知识查找。修改已确认知识时，旧版本继续生效，直到新版本经过确认。

需要文件资料时，在知识页打开「资料文件」并添加文件，选取文字保存为知识草稿。当前查找的是已确认知识，**不会直接搜索导入文件的全文**。详细操作见 [使用指南](docs/user-guide.md)。

## 本地数据与隐私

- 工作区、消息、知识版本、文件文字副本和执行记录存放在本机 SQLite；设置页显示实际数据目录。
- 文件读取由系统选择器中的明确选择触发，仅支持单文件不超过 2 MiB 的 UTF-8 `.txt` / `.md`，不扫描目录。
- 应用没有遥测，也不会自动上传工作区资料；下载模型和缺失的 WebView2 运行时是独立联网步骤。
- 数据库未加密。停用资料停止未来选用，历史对话、证据和请求副本仍保留。

更多边界见 [安全与隐私](docs/security.md)；报告漏洞见 [安全报告说明](SECURITY.md)。

## 从源码运行

开发目标是 Windows；已验证环境为 Windows 11 / WebView2。准备 Node.js 22.12+、npm、Rust MSVC 工具链、Visual Studio C++ Build Tools 与 Windows SDK，具体步骤见 [贡献与开发](CONTRIBUTING.md)。

```powershell
git clone https://github.com/hfdsdfgr/CortexOS.git
cd CortexOS/apps/desktop
npm.cmd ci
npm.cmd run tauri -- dev
```

项目通过根目录 `rust-toolchain.toml` 选择 MSVC 工具链。仅运行 `npm.cmd run dev` 得到的是浏览器预览，不包含完整桌面能力。

## 当前状态

已发布 [v0.1.0 预发布版](https://github.com/hfdsdfgr/CortexOS/releases/tag/v0.1.0)。类型检查、Windows 构建及多项隔离原生流程已有记录；最新镜头修复检查了实际相机中间位置，默认过渡为 420ms，可打断或切换为立即完成。

正式安装包的完整人工验收、150% 系统缩放、真实读屏、干净系统安装和长期真实模型稳定性仍待完成。已有性能记录均附带数据规模与环境，不能视为任意机器的性能保证。

后续顺序：**完成桌面验收 → 补齐数据管理 → Decision Lab 与固定评估集 → 评估后的可选 LoRA**。详见 [路线与功能状态](docs/roadmap.md)、[版本记录](CHANGELOG.md) 和 [实际验收记录](docs/milestone-log.md)。

## 反馈与许可

问题和建议请提交到 [GitHub Issues](https://github.com/hfdsdfgr/CortexOS/issues)，附上版本、复现步骤和去除私人内容后的截图或错误信息。

仓库现已公开，尚未指定项目许可证。公开可见不等于授予开源许可；复制、修改和再分发的授权范围需由项目维护者另行明确。第三方依赖与模型遵循各自许可证。
