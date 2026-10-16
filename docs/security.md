# 安全与隐私实现边界

2026-10-16，Phase 2。

## 当前已配置

- 没有 shell、文件、HTTP 或 opener 插件；18 个业务命令逐项授权，命令清单由 `tauri_build::AppManifest::commands` 生成。
- 主窗口 capability 仅允许当前业务动作；不使用宽泛 `core:default`，不提供任意 SQL、路径读取或 URL 代理。
- 生产 CSP 限制脚本、样式、字体和页面来源；禁用 object/frame，模型调用经 Rust 完成。
- 开发服务器只监听 loopback，固定端口，静态根目录为应用目录，token 不在该目录。
- 不引入遥测、外部字体或 CDN；token 文件已忽略，远程 URL 不含凭据。

开发 CSP 仅为 Vite 的 React 刷新脚本、样式注入和本机 HMR 放宽 inline 与本机连接。Vite 显式复用同一 `devCsp` 作为响应头，避免开发 URL 没有策略。生产策略保留严格限制。原生测试通过 `CORTEXOS_TEST_CDP_PORT` 临时请求 loopback 调试端口，Rust 仅在 debug 编译中读取并校验该端口；release 编译不包含此入口，产品配置不保存调试端口。测试使用独立 WebView2 数据目录。

## Phase 1 实现

Rust 固定连接 HTTP `127.0.0.1:11434`；显式禁用代理与重定向。debug 测试端口同样只允许明确的 127.0.0.1、无用户信息/查询/路径。请求前检查 `/api/show` 的来源字段与 GGUF 格式，拒绝云端别名；本机服务同时配置 `OLLAMA_NO_CLOUD=1`，已确认服务日志记录 cloud disabled。应用假设本机 Ollama 及当前 Windows 账号可信。

取消或超时释放 HTTP future。流分片先按字节组合再解析 UTF-8 JSON；限制单帧及总输出大小，畸形帧之前的有效内容保留。模型文字以普通文本呈现，没有 HTML 执行或工具权限。内部 thinking 字段不纳入显示或持久化。

工作区范围由命令与数据库复合外键共同校验，运行与消息查询均需工作区参数。SQL 参数化；事件拒绝 UPDATE/DELETE。应用日志不记录问题、回答或请求正文；可控测试和真实模型测试分别使用隔离数据与合成问题。

注册自定义 commands 时，通过 `tauri_build::AppManifest::commands` 建立命令权限清单，并明确授权对应窗口；不能仅凭空 capability 文件就假定后续新增的自定义命令默认受限。

实测 Tauri dev 代理返回的 WebView2 文档响应头不包含 Vite 原有 CSP，因此开发测试分别记录原生导航结果和 Vite 直接响应策略，不将两者混称为开发窗口已验证 CSP。独立桌面构建从原生响应验证生产 CSP。开发模式仅用于可信本地代码调试。

后续 Markdown 渲染禁用原始 HTML，限制链接协议，代码块仅展示。模型输出与检索内容不获得执行权限。

## Phase 4 文件要求

用户选择来源后才读取；规范化路径，限制扩展名与大小，防止符号链接越界。跳过凭据与 `.env`，导入前显示范围。引用真实内容版本和定位，失效时提示重新定位。

SQLite 数据目录不是加密保险库，当前未实现加密功能，不声称内容已加密。Windows 用户权限仍是本地边界。公开测试前完成一致性备份、恢复、导出、删除及模型/依赖许可证检查。

参考：[Tauri capabilities](https://v2.tauri.app/security/capabilities/)、[Tauri CSP](https://v2.tauri.app/security/csp/)。


## Phase 2A 知识权限与迁移

新增 list/get/save/approve_knowledge 四个工作区业务命令。来源消息由 Rust 检查工作区、角色、终态及摘录包含关系；SHA-256 在后端计算。版本与审批事件不可变，保存/确认在事务内检查 revision，保存草案不覆盖原生效版。内容以普通文本显示，知识不会自动加入模型上下文。

为知识编辑的窗口关闭保护，主窗口增加 core:event:allow-listen、allow-unlisten 与 core:window:allow-close。只有编辑器存在时注册关闭监听，阻止直接关闭并显示保存/放弃/继续编辑；确认离开后注销监听并走原有窗口关闭路径。未授予 destroy、文件、shell 或任意网络权限。

旧库升级前用 SQLite VACUUM INTO 生成同目录独立备份，全部迁移 checksum 检查通过后才升级。备份包含原有用户数据，保持本地保存；本切片没有通用备份恢复 UI，也不自动删除迁移前备份。


## Phase 2B 图谱边界

新增 load_knowledge_graph、save_knowledge_edge、save_graph_view 三个工作区命令；沿用现有事件/关闭权限保护关系编辑，没有新增文件/网络/强制销毁窗口权限。关系端点同时经事务查询及复合外键检查；重复有效关系、自环、无效类型和旧预期版本均拒绝，失败保留草稿。视图保存限制有限坐标、唯一节点、工作区与预期 revision，最多 1000 个位置；此上限不代表性能已验收。

演示图只存在前端常量中，不提供写入接口；切换到真实工作区后通过 Rust 读取实际数据。3D 节点标题通过 textContent 加入受控标签层，不执行 HTML，不请求远程字体或模型；标签与 WebGL 资源随场景卸载清理。知识图与执行图分开，尚未接入的执行图继续明确显示占位。
