# 安装与首次使用

适用版本：v0.1.0，Windows x64 预发布版。当前原生验证基于 Windows 11；其他系统组合尚未完成验收。

## 1. 安装 CortexOS

从 [v0.1.0 发布页](https://github.com/hfdsdfgr/CortexOS/releases/tag/v0.1.0) 下载 `CortexOS_0.1.0_x64-setup.exe`，安装到当前 Windows 用户。安装包未签名；遇到未知发布者提示时，先确认下载地址与校验值。

在安装包所在目录核验：

```powershell
Get-FileHash .\CortexOS_0.1.0_x64-setup.exe -Algorithm SHA256
```

预期 SHA-256：`1c067bed99cf0e22a738272a067a36eaad3d5f30fe682d09f6fa1d24825d3c23`，大小 2,949,609 字节。发布页同时提供 `SHA256SUMS.txt`。

应用使用 WebView2。已有运行时可离线安装应用；缺少时安装器需要联网获取运行时。模型服务与权重单独准备。

## 2. 准备本地模型

安装 [Ollama Windows 版本](https://ollama.com/download/windows) 并启动。官方 Windows 版通常在后台运行，详见 [Ollama Windows 文档](https://docs.ollama.com/windows)。安装后重新打开 PowerShell：

```powershell
ollama pull qwen3:4b-instruct
ollama list
```

第一条下载当前默认模型；下载需要联网并占用额外磁盘。模型标签、文件大小和运行内存可能变化，以实际下载和 `ollama show qwen3:4b-instruct` 为准。该模型是当前实现的默认选择，适用性仍取决于设备。

如果 Ollama 未在后台运行，可使用 `ollama serve`；已有服务时无需重复启动。CortexOS 固定连接 `http://127.0.0.1:11434`，不接受远程地址或云端模型别名。

希望 Ollama 自身也保持仅本地服务时，可按其官方方式配置用户环境变量 `OLLAMA_HOST=127.0.0.1:11434` 和 `OLLAMA_NO_CLOUD=1`，修改后重新启动 Ollama。应用不会自动替你更改系统环境。

## 3. 第一次提问

1. 打开 CortexOS，创建一个工作区。
2. 进入「设置」，检测连接，确认已下载的本地模型并保存。
3. 返回「对话」，输入问题。Enter 发送，Shift+Enter 换行。
4. 回答生成后，打开处理记录或 3D 执行轨迹，核对本次使用的内容与模型配置。

默认参数：总容量 4096 Token、回答上限 512 Token、温度 0.3、超时 180 秒。设置中的参数从下一次回答开始生效；Token 不等于字数。

## 4. 让自己的知识参与回答

在知识页新建知识，或从回答选中文字保存为草稿。检查内容后确认版本，再回到对话提问。自动查找只使用当前工作区已生效的知识；也可以手动选用并预览发给模型的内容。

文件资料需先在「资料文件」明确选择并导入，再把所需文字存为知识并确认。导入文件本身不会触发全文检索。完整流程见 [使用指南](user-guide.md)。

## 数据与升级

设置页显示真实数据目录。需要备份时，先正常关闭应用，确认进程退出，再复制整个数据目录到自行选择的位置；不要在应用仍写入时只复制 `cortexos.sqlite3`。SQLite 的 WAL 等配套文件也属于目录内容。

数据库升级前应用会创建一致性备份，但当前没有通用恢复、导出或永久删除界面，也未验收任意版本的回退。重要数据请另存备份，避免用旧程序打开已升级的数据库。卸载默认保留应用数据；删除数据是另一项明确选择。

连接、模型和图谱问题见 [常见问题](troubleshooting.md)。
