# 安全与隐私实现边界

2026-10-15，Phase 0。

## 当前已配置

- 仅本地 UI；没有 shell、文件、HTTP 或 opener 插件，没有自定义命令。
- 主窗口 capability 不授权任何前端调用；不使用宽泛 `core:default`。
- 生产 CSP 限制脚本、样式、字体和页面来源；禁用 object/frame，模型调用未来经 Rust 完成。
- 开发服务器只监听 loopback，固定端口，静态根目录为应用目录，token 不在该目录。
- 不引入遥测、外部字体或 CDN；token 文件已忽略，远程 URL 不含凭据。

开发 CSP 仅为 Vite 的 React 刷新脚本、样式注入和本机 HMR 放宽 inline 与本机连接。Vite 显式复用同一 `devCsp` 作为响应头，避免开发 URL 没有策略。生产策略保留严格限制。原生测试通过 `CORTEXOS_TEST_CDP_PORT` 临时请求 loopback 调试端口，Rust 仅在 debug 编译中读取并校验该端口；release 编译不包含此入口，产品配置不保存调试端口。测试使用独立 WebView2 数据目录。

## Phase 1 接入要求

Rust 模型服务只允许明确的 loopback 目标，禁止任意代理 URL，拒绝跳转到非获准目标。执行超时和取消可回收请求，错误输出不包含用户正文。工作区范围从命令参数与数据库共同校验，不能依赖页面过滤。

注册自定义 commands 时，通过 `tauri_build::AppManifest::commands` 建立命令权限清单，并明确授权对应窗口；不能仅凭空 capability 文件就假定后续新增的自定义命令默认受限。

实测 Tauri dev 代理返回的 WebView2 文档响应头不包含 Vite 原有 CSP，因此开发测试分别记录原生导航结果和 Vite 直接响应策略，不将两者混称为开发窗口已验证 CSP。独立桌面构建从原生响应验证生产 CSP。开发模式仅用于可信本地代码调试。

后续 Markdown 渲染禁用原始 HTML，限制链接协议，代码块仅展示。模型输出与检索内容不获得执行权限。

## Phase 4 文件要求

用户选择来源后才读取；规范化路径，限制扩展名与大小，防止符号链接越界。跳过凭据与 `.env`，导入前显示范围。引用真实内容版本和定位，失效时提示重新定位。

SQLite 数据目录不是加密保险库，Phase 0 未实现加密功能，不声称内容已加密。Windows 用户权限仍是本地边界。公开测试前完成一致性备份、恢复、导出、删除及模型/依赖许可证检查。

参考：[Tauri capabilities](https://v2.tauri.app/security/capabilities/)、[Tauri CSP](https://v2.tauri.app/security/csp/)。
