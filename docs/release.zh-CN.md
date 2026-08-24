# 发布检查

[English](release.md) | 中文

OpenCode++ 有一个产品交付物和一个开发者交付物：

- Windows EXE 是产品发布物：官方 OpenCode Desktop 的用户级全局插件安装器，以及经过特征检查的原生命令补丁；
- npm 包是开发者 artifact：把 CLI、MCP、Harness 和共享运行时作为开发/CI 工具携带，Desktop 用户从不安装它。

benchmark fixture、agent-runs、仓库文档、源代码资产和本地运行时文件不应进入 npm 包，npm 包还必须排除 `release/`、`.installer-build/` 和 `apps/desktop/`。Windows EXE 只修改文档规定且经过特征检查的命令分发器，安装后需要重启 OpenCode。

## 发布前检查

```powershell
npm run check
npm run lint
npm run format:check
npm run docs:cli:check
npm run docs:bilingual:check
npm test
npm run benchmark
npm run benchmark:agent
npm run benchmark:desktop
npm run build
npm run build:installer:windows
npm run test:installer:windows
npm run release:verify
```

Windows 安装器构建必须在 Windows + Node.js 20+ 和 .NET Framework 4.x 构建工具环境执行。esbuild 压缩插件，gzip 生成 payload，再由 Windows C# 编译器嵌入 EXE，并生成 `.sha256` 与 `opencode-plusplus-release.json`。发布前运行 `npm run test:installer:windows`，验证安装、status、disable、enable、插件加载、三个命令文件、original backup、失败回滚、uninstall restore 和 12 MiB 体积上限。

`npm run release:verify` 还会核对 EXE 存在、大小、SHA256、manifest、独立 plugin bundle 加载、三条本地 command、patch marker、backup 与卸载恢复。`npm run benchmark:desktop` 是确定性的进程内插件 benchmark，付费模型调用数固定为 0。

PR CI 同时运行 Ubuntu 和 Windows，绝不调用付费 executor。Linux 验证 npm 开发包和确定性 proxy benchmark；Windows 构建 EXE、执行安装/恢复 gate，并运行 Desktop plugin benchmark。真实 Desktop 启动只通过手动 `Desktop smoke` workflow，在带 `opencode-desktop` 标签且已安装 OpenCode Desktop 的自托管 Windows runner 上运行 `npm run test:desktop:real`。

## 版本和包边界

根 package.json 的 version 是唯一版本源。package-info:generate 生成 CLI、MCP、freshness 和插件使用的运行时版本常量。release:verify 检查 npm pack manifest、文件数、包大小和必需入口。

确认 npm 包包含 dist（含插件入口 `dist/integrations/opencode/global-plugin.js`）、README、配置示例和 LICENSE，但不包含 node_modules、benchmark fixture、agent-runs、本地 cache、`.installer-build/`、release、开发脚本或 `.agent-context`。Windows Release 同时上传 EXE、SHA256 和 release manifest，清洁 checkout 能重新构建。

## Windows 发布说明

当前 Release 二进制未做商业代码签名。用户遇到 SmartScreen 时，应先核对 Release 页的 SHA256，再决定是否运行。不要把本地 EXE 或用户配置文件提交进仓库。

发布后确认 npm 版本、GitHub Release 资产、EXE digest、manifest version 和 origin/main commit。版本变更只修改根 package.json；package-info 和 Desktop release manifest 必须与其一致。
