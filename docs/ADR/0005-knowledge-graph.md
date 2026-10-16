# ADR 0005：知识图谱与独立视图存储

日期：2026-10-16。状态：已实施，Phase 2B。

采用计划中的 Three.js 0.186.1、React Three Fiber 9.8.2、Drei 10.7.9；npm registry 核对其 peer 范围支持当前 React 19.3.1。@types/three 0.186.0 仅用于开发，锁文件一并提交。使用已有窗口/事件权限和三个图谱命令，没有增加通用系统访问能力。

关系使用稳定边 ID 和只追加的修订记录，版本包含两端节点、方向、类型、是否有效、修改说明与时间；节点端点更新不会自动重审关系。布局表按工作区单独保存有限坐标、相机和目标点，带 revision 检查。停用关系是可追溯修订，未提供永久删除。

按 [R3F 按需渲染指南](https://r3f.docs.pmnd.rs/advanced/scaling-performance) 使用 demand 循环，[Drei 控件](https://drei.docs.pmnd.rs/controls/introduction) 提供旋转、平移和缩放。DPR 限制为 1–1.5；标签仅显示选中及邻近条目。初始位置是确定性函数，不启动持续力导向模拟；动态布局需真实需求和性能证据后再用 Worker 实现。

实测发现 Html 组件在筛选/卸载时触发跨 React root 的 DOM 删除冲突。改用 Scene 自身管理的有限 DOM 标签层，使用 textContent 与相机投影，卸载时移除。保留节点索引作为完整键盘与 WebGL 失效入口。

3D 代码独立懒加载；当前压缩后块约 933 kB（gzip 248 kB），构建仍提示超过 500 kB，没有隐藏警告。渲染库内部仍出现 THREE.Clock 弃用警告，检查中未产生页面异常。首批只验收小图，N+1 关系历史查询等规模限制在 Phase 3 实测后处理。
