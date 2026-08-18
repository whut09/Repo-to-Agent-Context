# 快速开始

[English](getting-started.md) | 中文

## Windows 推荐路径

OpenCode++ 的主要使用方式是作为插件运行在官方 OpenCode Desktop 内。

1. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 安装或升级前完全退出 OpenCode Desktop。
3. 双击 EXE，完成后重新打开 OpenCode Desktop。
4. 打开目标仓库，确认工具列表中存在 `opencode_plusplus_status`。

安装器只作用于当前 Windows 用户，不需要管理员权限，并写入 OpenCode 配置目录。路径、自定义配置目录、升级、卸载和排障见 [Windows 安装与使用](integrations/opencode-desktop.zh-CN.md)。

## 第一个会话检查清单

1. 运行 `opencode-plusplus-setup-win-x64.exe --status` 直接检查本地状态，或让 Agent 调用状态工具。
2. 编辑期间保持插件启用，以获得命令/路径 Guard 和证据记录。
3. 完成重要编辑后等待会话空闲，在 `.agent-context/sidecar/latest.md` 查看报告。
4. 只有明确需要无 Guard 会话时才使用 EXE 的 `--disable` 或禁用工具，完成后重新启用。

OpenCode Slash Command 默认是模型 Prompt。安装器会补丁三个精确的 OpenCode++ 命令，使它们在 Desktop 中直接本地执行，不经过模型。Desktop 工具仍然经过模型；EXE 的状态、启用和禁用参数也可以在 Desktop 外本地执行。

## 高级 CLI

CLI 是维护和自动化入口，不是 Desktop 的替代界面：

```powershell
npm install --global opencode-plusplus
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "修复登录超时并补回归测试" . --executor mock --max-loops 3
```

CI、脚本、仓库 context 生成或需要明确 artifact/退出码的 Harness-led 循环使用 CLI/MCP；日常交互式编码使用 Desktop 插件。

## 本地开发

```powershell
npm ci
npm run check
npm run build
npm test
npm run build:installer:windows
```

仓库运行时文件写入 `.agent-context/`。`opencode-plusplus run "任务" .` 只生成 task pack 和 trace，不执行外部 Agent；`orchestrate` 才是由 Harness 持有执行权的流程。
