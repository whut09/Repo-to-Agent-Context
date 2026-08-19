# OpenCode++

[English](README.en.md) | 中文

**面向官方 OpenCode Desktop 的 Windows 插件、证据层和 Harness。**

OpenCode++ 不替换官方 OpenCode Desktop，也不安装第二个桌面外壳。Windows EXE 把自包含的全局插件和状态文件安装到当前用户配置目录，并对内置命令分发器增加只匹配三个 OpenCode++ 命令名的窄范围补丁。安装之后，日常编码仍在 OpenCode Desktop 中完成。

## 五分钟安装

1. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 完全退出 OpenCode Desktop。
3. 双击 EXE，等待安装完成。
4. 重新打开 OpenCode Desktop，打开目标仓库并新建会话。
5. 在会话中输入 `/plusplus-task <任务>`，Harness 会接管任务准备、编辑边界、验证和收尾。

安装器只写当前 Windows 用户目录，不需要管理员权限。默认位置为 `%USERPROFILE%\.config\opencode`；如果 OpenCode 使用 `OPENCODE_CONFIG_DIR` 或 `XDG_CONFIG_HOME`，插件会安装到对应目录。

## Harness 工作流

安装器同时写入 `/plusplus-task`、`/plusplus-verify` 两个全局 Slash Command 和 `opencode-plusplus` skill，重启 Desktop 后即可直接使用，无需任何命令行：

- `/plusplus-task <task>`：按 `opencode_plusplus_prepare` → 读 `mustInspect` → 只在 `allowedEditGlobs` 内修改 → 跑 `requiredCommands` → `opencode_plusplus_evaluate` → `opencode_plusplus_next` 的顺序执行；`nextAction` 不是 `finalize` 时不得声称完成。
- `/plusplus-verify`：重跑 evaluate + next，列出阻塞项、缺失证据和必跑命令。
- skill 在具体编码任务、跨模块修改和收尾验证时自动加载，纯问答不加载。

## 状态与开关

| 操作     | Desktop 工具（经过模型）    | 本地直接 EXE 参数 |
| -------- | --------------------------- | ----------------- |
| 查看状态 | `opencode_plusplus_status`  | `--status`        |
| 启用     | `opencode_plusplus_enable`  | `--enable`        |
| 禁用     | `opencode_plusplus_disable` | `--disable`       |

OpenCode Slash Command 默认是发给模型的 Prompt Template。安装器会对三个精确的 OpenCode++ 命令名安装宿主分发器补丁，因此 `/opencode-plusplus-status`、`/opencode-plusplus-on` 和 `/opencode-plusplus-off` 在补丁有效时直接读写本地状态，不调用模型；其他 Slash Command 不受影响。EXE 参数仍可在 Desktop 外直接控制状态。

启用时，插件在工具执行前检查危险命令、未知脚本和受保护路径；工具执行后记录退出码、脱敏输出、会话和 working-tree hash；会话空闲时运行增量验证。禁用只暂停保护、证据和空闲验证，控制工具仍然可用。

## 原理和边界

- EXE 只修改 OpenCode Desktop `app.asar` 中经过特征检查的命令分发器，并在旁边备份原文件；不修改安装器、renderer、更新器或账户登录。
- 当前 OpenCode 插件 API 没有公开的第三方设置面板或无需模型的直接命令扩展点；Desktop 工具会经过模型，本地直接控制由 EXE 提供。
- 插件只观察 OpenCode 暴露的工具和事件，不是操作系统级沙箱，不能阻止其他程序修改文件。
- Guard 是命令和路径边界，不等同于完整安全审计；不透明的工具参数可能只能产生证据或告警。
- Evidence 会脱敏并截断输出；它证明系统捕获了什么，不保证测试覆盖所有业务行为。
- 仓库运行时报告写入目标仓库的 `.agent-context/`；卸载插件不会删除这些历史 artifact。

更完整的运行结构见 [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)。

## 安装文件和仓库文件

用户级安装文件：

```text
%USERPROFILE%\.config\opencode\plugins\opencode-plusplus.js
%USERPROFILE%\.config\opencode\opencode-plusplus\state.json
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-on.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-off.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-status.md
%USERPROFILE%\.config\opencode\commands\plusplus-task.md
%USERPROFILE%\.config\opencode\commands\plusplus-verify.md
%USERPROFILE%\.config\opencode\skills\opencode-plusplus\SKILL.md
```

目标仓库中的 Harness 文件位于 `.agent-context/`，包括 context、trace、evidence、policy、guard、loop 和 orchestrator artifact。它们不是 OpenCode Desktop 安装文件。

## 升级、关闭和卸载

- **升级**：退出 OpenCode，下载新 EXE 并再次双击。安装器覆盖插件、清理旧 Prompt Command，并保留有效的启用状态。
- **临时关闭**：使用 EXE 的 `--disable`，之后用 `--enable` 恢复；也可让 Agent 调用对应工具。
- **卸载**：使用 EXE 的 `--uninstall`。它只删除 OpenCode++ 写入的插件、命令、skill、状态和安装清单，不删除仓库 `.agent-context/`。
- **验证状态**：使用 EXE 的 `--status --json`，或在 OpenCode 中调用状态工具。

## 产品边界

OpenCode++ 的唯一运行时产品是官方 OpenCode Desktop 的 Windows 插件：下载 EXE、双击安装、重启 OpenCode Desktop，没有其他安装或使用路径。`src/integrations/opencode/global-plugin.ts` 是插件的唯一生产运行时入口；EXE 安装流程与 `opencode_plusplus_*` 工具名保持不变。

CLI（`opencode-plusplus`）和 MCP（`opencode-plusplus-mcp`）是仓库内部的 dev/test compatibility surface：它们供 CI、源码构建、诊断和 Harness-led 批处理使用，保留在 npm 包中仅作为开发依赖，**不是 Desktop 用户的安装或使用路径**。npm 包本身也是开发工具，Desktop 用户不需要 `npm install` 任何东西。

### CLI 内部用途（非用户入口）

```powershell
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "修复登录超时并补回归测试" . --executor mock --max-loops 3
```

CLI、MCP 和 Desktop 插件共享 Guard、Evidence、Policy、Decision 和 Loop Engineering 实现，但控制边界不同：Desktop 插件观察当前 OpenCode 会话；Harness-led CLI 才负责多轮执行、收集和终止决策。CLI/MCP 的内部定位与降级明细见 [产品边界说明](docs/developer/product-boundary.zh-CN.md)。

## 从源码构建 Windows EXE

需要 Windows、Node.js 20+ 和 npm：

```powershell
npm ci
npm run check
npm run build
npm run build:installer:windows
```

输出为 `release/opencode-plusplus-setup-win-x64.exe` 和对应的 `.sha256`。构建流程压缩插件并嵌入轻量 .NET Framework 安装器，不携带 Node 或 Electron runtime，也不依赖本机仓库绝对路径。

## 文档

- [Windows 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)
- [产品边界说明（CLI/MCP 内部定位）](docs/developer/product-boundary.zh-CN.md)
- [全局 Sidecar 运行机制](docs/integrations/opencode-sidecar.zh-CN.md)
- [总体架构](docs/concepts/architecture.zh-CN.md)
- [集成模式](docs/concepts/integration-modes.zh-CN.md)
- [Loop Engineering](docs/concepts/loop-engineering.zh-CN.md)
- [CLI 参考](docs/reference/cli-reference.zh-CN.md)
- [配置参考](docs/reference/config.zh-CN.md)
- [发布检查](docs/release.zh-CN.md)

许可证：[MIT](LICENSE)。
