# 发布检查

[English](release.md) | 中文

OpenCode++ 发布两个运行时交付物：

- npm 包：CLI、MCP、Harness 和共享运行时；
- Windows EXE：官方 OpenCode Desktop 的用户级全局插件安装器。

benchmark fixture、agent-runs、仓库文档、源代码资产和本地运行时文件不应进入 npm 包。Windows EXE 不修改 Desktop 二进制，安装后需要重启 OpenCode。

## 发布前检查

```powershell
npm run check
npm run lint
npm run format:check
npm run docs:cli:check
npm test
npm run benchmark
npm run benchmark:agent
npm run build
npm run release:verify
npm run build:installer:windows
```

Windows 安装器构建必须在 Windows + Node.js 20+ 上执行。它使用 Node SEA 和 postject，把全局插件嵌入 EXE，并生成 .sha256。发布前用临时 --config-dir 验证安装、status、disable、enable 和 uninstall。

## 版本和包边界

根 package.json 的 version 是唯一版本源。package-info:generate 生成 CLI、MCP、freshness 和插件使用的运行时版本常量。release:verify 检查 npm pack manifest、文件数、包大小和必需入口。

确认 npm 包包含 dist、README、配置示例和 LICENSE，但不包含 node_modules、benchmark fixture、agent-runs、本地 cache 或 .agent-context。Windows Release 同时上传 EXE 和 SHA256，清洁 checkout 能重新构建。

## Windows 发布说明

当前 Release 二进制未做商业代码签名。用户遇到 SmartScreen 时，应先核对 Release 页的 SHA256，再决定是否运行。不要把本地 EXE 或用户配置文件提交进仓库。

发布后确认 npm 版本和 GitHub Release 资产状态。版本变更只修改根 package.json，再生成 package-info。
