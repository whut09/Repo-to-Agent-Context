# OpenCode++ 中文文档

[English](README.en.md) | [中文主 README](README.md)

OpenCode++ 是官方 OpenCode Desktop 的 Windows Harness 插件。普通用户只有一条使用路径：

1. 从 GitHub Release 下载 `opencode-plusplus-setup-win-x64.exe`；
2. 完全退出 OpenCode Desktop；
3. 双击 EXE 安装；
4. 重启 OpenCode Desktop；
5. 使用 `/plusplus-task`、`/plusplus-verify` 和插件 Harness 工具；
6. 使用 `/opencode-plusplus-status`、`/opencode-plusplus-on`、`/opencode-plusplus-off` 查看或切换状态；
7. 在仓库 `.agent-context/` 查看验证和证据报告。

完整说明见 [中文主 README](README.md)。

- [Windows 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)
- [生成文件与提交策略](docs/reference/generated-files.zh-CN.md)
- [发布检查](docs/release.zh-CN.md)

CLI 和 MCP 仅是源码开发、CI 和兼容面，不是普通用户安装方式。许可证为 [MIT](LICENSE)。
