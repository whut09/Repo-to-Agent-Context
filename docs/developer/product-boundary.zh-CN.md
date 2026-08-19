# 产品边界说明

[English](product-boundary.md) | 中文

OpenCode++ 的运行时产品只有一个：**官方 OpenCode Desktop 的 Windows 插件**。用户的全部操作是：下载 `opencode-plusplus-setup-win-x64.exe`、双击安装、重启 OpenCode Desktop。没有 `npm install` 用户路径，没有 TUI，没有第二个 Desktop 外壳。

## 唯一生产运行时入口

- `src/integrations/opencode/global-plugin.ts` 是插件唯一的生产运行时入口。
- 构建时由 esbuild 打成自包含的 CommonJS bundle（`build:installer:windows`），gzip 后嵌入 EXE 资源 `OpenCodePlusPlus.Plugin.gz`。
- bundle 可以脱离本仓库目录独立加载，不依赖 `node_modules`，不依赖仓库绝对路径；运行时只使用 Node.js 内置模块。
- 插件工具名保持不变：`opencode_plusplus_enable`、`opencode_plusplus_disable`、`opencode_plusplus_status`、`opencode_plusplus_prepare`、`opencode_plusplus_retrieve`、`opencode_plusplus_evaluate`、`opencode_plusplus_next`。
- 三个本地 Slash Command（`/opencode-plusplus-status`、`/opencode-plusplus-on`、`/opencode-plusplus-off`）由窄范围宿主补丁执行，不调用模型。

## 降级为内部 dev/test 兼容面

以下内容保留在仓库和 npm 开发者包中，但**不再是用户安装或使用路径**：

| 模块       | bin / 入口              | 定位                                                                                                  |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/cli/` | `opencode-plusplus`     | CI、仓库 context 生成、诊断、Harness-led 批处理；也是插件运行时测试的内部 CLI 入口（`cli-runner.ts`） |
| `src/mcp/` | `opencode-plusplus-mcp` | 供外部 Agent 宿主通过 MCP 协议调用 Harness 的开发与兼容面                                             |

- 两者共享 `src/harness/`、`src/core/` 的 Guard、Evidence、Policy、Decision、Loop Engineering 实现。
- npm 主包继续携带 `dist/cli` 和 `dist/mcp`，仅作为开发依赖和 CI 工具，保证旧 CLI/MCP 兼容调用不破坏插件构建；Desktop 用户不需要安装 npm 包。
- 评估结论：暂不拆包。拆包会改变 CI、docs:cli 快照和现有集成方的安装方式，而当前约束只需要"不再是用户路径"，保留开发依赖是兼容性最优解。

## 保留（Harness 核心，插件内部模块）

- `src/harness/`：control-plane、verification-plane、evidence 等全部核心逻辑保留。
- `src/integrations/opencode/plugin-runtime/harness/`：`prepare`、`retrieve`、`evaluate`、`next` 作为进程内插件工具直接复用上述核心，**不在插件内 spawn CLI**。
- `src/core/`、`src/analyzers/`、`src/outputs/`：索引、分析、artifact 输出，被插件 bundle 直接内联。
- `src/installer/`：Windows 安装器和宿主补丁，EXE 构建路径。

## 删除与确认不存在

- 旧 Electron Desktop MVP 和 TUI 外壳：仓库中已无对应目录（不存在 `apps/desktop/` 实体代码）；`.gitignore`、eslint ignores、`verify-release.mjs` forbiddenPrefixes 中的 `apps/desktop/` 条目保留，用于防止旧构建产物误入发布包。
- 发布产物不包含 Node.js、Electron、OpenCode 运行时或源代码仓库。

## 发布包边界

- **EXE（用户发布物）**：只嵌入插件 bundle 和 native command patch 两个资源；`test/release-boundary.test.ts` 静态校验安装器资源清单。
- **npm 包（开发者发布物）**：`files` 白名单只含 `dist/**/*.js`、README、config 示例、`.env.example`；禁止 `release/`、`.installer-build/`、`node_modules/`、`.agent-context/`、`apps/desktop/`、`docs/` 进入包内。`scripts/verify-release.mjs` 要求插件入口 `dist/integrations/opencode/global-plugin.js` 必须存在。

## 守护测试

- `test/plugin-bundle.test.ts`：bundle 独立加载、单一函数导出、不含仓库路径、不 require node_modules 外部包、7 个工具名注册兼容、构建不依赖 CLI/MCP 模块。
- `test/release-boundary.test.ts`：安装器只嵌入插件+补丁、构建脚本只打包 `global-plugin.ts`、`global-plugin.ts` 只导入 plugin-runtime、npm files 白名单排除发布/构建产物。
- `test/plugin-harness-tools.test.ts`、`test/opencode-plugin-runtime.test.ts`：Desktop 插件工具注册与钩子行为兼容。
