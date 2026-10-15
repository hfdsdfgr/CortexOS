# CortexOS 3D

面向 Windows 的本地 AI 项目工作台：对话、可追溯知识、版本审核，以及知识关系和实际执行过程的 3D 探索。

当前处于开发前规划阶段，尚未初始化桌面应用。

## 开发文档

- [项目总纲](development.md)
- [开发与交互规范](docs/development-standards.md)
- [实施计划与阶段验收](docs/implementation-plan.md)

## 仓库与推送

本目录使用独立 Git 仓库，主分支为 `main`。远程为私有 GitHub 仓库 [hfdsdfgr/CortexOS](https://github.com/hfdsdfgr/CortexOS)。

本机为该仓库配置 Windows Git Credential Manager，使用用户提供的最新 token。在本目录正常执行 `git push` 即可复用凭据。凭据配置属于本机，不随克隆迁移到其他设备。

根目录 `Gittoken.txt` 仅供本机使用，已加入忽略规则；提交前保持该文件未被跟踪。token 不应出现在源码、文档或远程 URL 中。更换 token 后需要更新本机凭据。
