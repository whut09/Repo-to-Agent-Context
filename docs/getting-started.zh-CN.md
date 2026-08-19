# 快速开始

[English](getting-started.md) | 中文

## Windows 推荐路径

OpenCode++ 的主要使用方式是作为插件运行在官方 OpenCode Desktop 内。

1. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 安装或升级前完全退出 OpenCode Desktop。
3. 双击 EXE，完成后重新打开 OpenCode Desktop。
4. 打开目标仓库，在新会话中输入 `/plusplus-task <任务>`，让 Harness 接管任务。

安装器只作用于当前 Windows 用户，不需要管理员权限，并写入 OpenCode 配置目录。它同时写入全局 `/plusplus-task`、`/plusplus-verify` Slash Command 和 `opencode-plusplus` skill，重启后无需任何命令行即可使用。路径、自定义配置目录、升级、卸载和排障见 [Windows 安装与使用](integrations/opencode-desktop.zh-CN.md)。

## 第一个会话检查清单

1. 编码任务输入 `/plusplus-task <task>`，收尾验证输入 `/plusplus-verify`。
2. 编辑期间保持插件启用，以获得命令/路径 Guard 和证据记录。
3. 完成重要编辑后等待会话空闲，在 `.agent-context/sidecar/latest.md` 查看报告。
4. 只有明确需要无 Guard 会话时才使用 EXE 的 `--disable` 或禁用工具，完成后重新启用。

OpenCode Slash Command 默认是模型 Prompt。安装器会补丁三个精确的 OpenCode++ 控制命令（`/opencode-plusplus-status`、`/opencode-plusplus-on`、`/opencode-plusplus-off`），使它们在 Desktop 中直接本地执行，不经过模型。Harness 工作流命令（`/plusplus-task`、`/plusplus-verify`）经过模型；EXE 的状态、启用和禁用参数也可以在 Desktop 外本地执行。

## 开发者面（CLI / MCP，内部）

CLI 和 MCP 是内部 dev/test 兼容面，不是用户路径。Desktop 用户只通过 EXE 安装，从不执行 `npm install`。开发者可用它们做 CI、脚本、仓库 context 生成、诊断，或需要明确 artifact/退出码的 Harness-led 循环：

```powershell
npm ci
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "修复登录超时并补回归测试" . --executor mock --max-loops 3
```

用户面、内部面和已删除内容的划分见 [产品边界说明](developer/product-boundary.zh-CN.md)。

## 本地开发

```powershell
npm ci
npm run check
npm run build
npm test
npm run build:installer:windows
```

仓库运行时文件写入 `.agent-context/`。`opencode-plusplus run "任务" .` 只生成 task pack 和 trace，不执行外部 Agent；`orchestrate` 才是由 Harness 持有执行权的流程。
