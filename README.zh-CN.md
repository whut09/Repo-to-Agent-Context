# OpenCode++ 中文文档入口

[English](README.en.md) | [中文主 README](README.md)

本文件保留为中文入口。完整产品说明请阅读 [README.md](README.md)。当前产品重点是 **Windows 端官方 OpenCode Desktop 插件**：双击 EXE 安装后，在 OpenCode Desktop 中提供 Guard 和证据能力；`/opencode-plusplus-status`、`/opencode-plusplus-on` 和 `/opencode-plusplus-off` 由窄范围宿主补丁直接本地执行，不调用模型。

- [Windows 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)
- [产品边界说明（CLI/MCP 内部定位）](docs/developer/product-boundary.zh-CN.md)
- [全局 Sidecar 运行机制](docs/integrations/opencode-sidecar.zh-CN.md)
- [配置参考](docs/reference/config.zh-CN.md)
- [发布检查](docs/release.zh-CN.md)

OpenCode++ 只修改 `app.asar` 中经过特征检查的命令分发器，保留可恢复备份，不提供第二个 Desktop 外壳。CLI 和 MCP 是内部 dev/test 兼容面，用于高级 Harness、CI、诊断和从源码构建安装器，不是用户安装或使用路径。许可证为 [MIT](LICENSE)。
