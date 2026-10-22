# CortexOS 文档

当前版本为 [v0.1.0 预发布版](https://github.com/hfdsdfgr/CortexOS/releases/tag/v0.1.0)，状态更新于 2026-10-22。

## 使用与下载

| 文档 | 解决的问题 |
| --- | --- |
| [安装与首次使用](getting-started.md) | 下载、校验、准备本地模型和第一次提问 |
| [使用指南](user-guide.md) | 对话、知识、文件、引用和两种图谱的操作 |
| [常见问题](troubleshooting.md) | 连接失败、资料未命中、显示与数据问题 |
| [路线与功能状态](roadmap.md) | 已完成、待验收与计划中的能力 |
| [版本记录](../CHANGELOG.md) | 已发布版本及重要变化 |
| [安全与隐私](security.md) | 数据保存、联网、文件访问和信任边界 |

## 开发与贡献

先读 [贡献与开发](../CONTRIBUTING.md)，再按任务查阅：

| 文档 | 用途 |
| --- | --- |
| [产品范围](PRD.md) | 当前用户任务和功能边界 |
| [架构](architecture.md) | 模块、数据流和代码入口 |
| [数据库契约](database-schema.md) | 数据不变量与迁移；实际结构以 SQL 为准 |
| [开发与交互规范](development-standards.md) | 开发约束和验收要求 |
| [HTML 参考界面规范](design/html-prototype-ui.md) | 当前共享视觉与交互标准，替代早期 V3 |
| [界面用词规范](design/plain-language.md) | 普通话表达与技术准确性 |
| [检查方法](test-plan.md) | 专项检查入口及真实模型检查 |
| [Windows 交付证据](windows-delivery.md) | 安装包校验、验证范围和人工待办 |

## 设计依据与历史记录

[development.md](../development.md) 是原始产品总纲，包含未来目标，不是当前完成清单。[实施计划](implementation-plan.md) 和 [纠偏计划](refactoring-plan.md) 保留分阶段决策；当前状态以 [路线](roadmap.md) 为入口，实际完成以 [里程碑](milestone-log.md) 和代码为依据。

[ADR 目录](ADR/) 保存架构决策。[差距审计](gap-analysis.md)、[认知架构 V2](cognitive-architecture-v2.md)、[图谱体验 V2](graph-experience-v2.md) 是对应阶段的设计与审计记录；其中“尚未实现”可能已在后续切片完成。旧视觉文档保留参考分析，当前按用户最新 HTML 参考规范实施。

性能报告记录特定环境和版本的测量：[早期基线](graph-baseline.md)、[批量绘制](graph-performance-p1-c2a.md)、[流式隔离](streaming-performance.md)、[按需读取](graph-on-demand-reads.md)、[多中心探索](graph-multi-center.md)、[图谱阅读](graph-reading.md)。报告里的规模上限、绘制回调率和测试替身不能当成产品吞吐或屏幕 FPS 承诺。
