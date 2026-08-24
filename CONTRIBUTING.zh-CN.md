# 贡献指南

OpenCode++ 是面向 Windows 的 OpenCode Desktop 插件。贡献应改善插件、Harness 行为、安装器安全性、测试或文档，不应把项目变成第二个 Desktop 应用。

## 流程

1. Fork 仓库并创建聚焦分支。
2. 阅读 `AGENTS.md` 和变更边界内的源码。
3. 行为变更先增加确定性测试。
4. 用户文档必须同步维护英文和中文。
5. 创建 Pull Request 前运行相关检查。

## Desktop 变更

用户路径是双击 Windows EXE，然后在 OpenCode Desktop 中选择 **OpenCode++** 模式。不要通过增加 Slash Command、修改 `app.asar` 或增加第二套 UI 来绕过模式集成。安装器变更必须保留用户配置，安全清理旧文件，并保证插件 hook 出错时不让 OpenCode 崩溃。

Windows 上运行：

```powershell
npm run check
npm run lint
npm run format:check
npm run docs:bilingual:check
npm test
npm run build:installer:windows
npm run test:installer:windows
npm run release:verify
```

不要提交 `dist/`、`release/`、`.installer-build/`、`node_modules/`、`.agent-context/`、benchmark 结果、密钥或本地 OpenCode 配置。
