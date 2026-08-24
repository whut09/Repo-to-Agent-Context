# OpenCode++

[English](README.en.md) | 中文

**官方 OpenCode Desktop 的 Windows Harness 插件。**

OpenCode++ 不提供第二个桌面软件，也不要求普通用户安装 npm 包或使用命令行。Release EXE 会把自包含插件安装到当前用户的 OpenCode 配置目录，并为三个本地状态命令安装窄范围 `app.asar` 补丁。日常操作全部在官方 OpenCode Desktop 中完成。

## 安装

1. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 完全退出 OpenCode Desktop。
3. 双击 EXE，等待安装完成。
4. 重新打开 OpenCode Desktop，并打开目标仓库。
5. 新建会话，输入 `/plusplus-task <任务>`。

安装器作用于当前 Windows 用户，不需要管理员权限。默认使用 `%USERPROFILE%\.config\opencode`，也会遵循 OpenCode 已配置的 `OPENCODE_CONFIG_DIR` 或 `XDG_CONFIG_HOME`。

## 在 Desktop 中使用 Harness

- `/plusplus-task <任务>`：调用 `opencode_plusplus_prepare`，阅读 `mustInspect`，遵守编辑边界，运行 `requiredCommands`，再调用 `opencode_plusplus_evaluate` 和 `opencode_plusplus_next`。
- `/plusplus-verify`：重新评估当前任务，显示 blocker、缺失证据、必跑命令和下一步。
- `opencode_plusplus_retrieve`：在盲目搜索前返回与任务相关的文件和 score breakdown。
- 只有 `opencode_plusplus_next` 返回 `finalize` 且没有 blocker 时，任务才能视为完成。

这些 Harness 工具运行在 Desktop 插件进程内，不会启动 OpenCode++ CLI，也不会自行调用另一个付费 Agent。

## 状态与开关

在 OpenCode Desktop 中直接使用：

| Slash Command               | 结果                              |
| --------------------------- | --------------------------------- |
| `/opencode-plusplus-status` | 显示安装、启用、版本和 patch 状态 |
| `/opencode-plusplus-on`     | 启用 Guard、证据和 idle 验证      |
| `/opencode-plusplus-off`    | 暂停 Guard、证据和 idle 验证      |

这三个命令由安装器补丁在本地处理，不发送给模型，也不执行 shell。`/plusplus-task` 和 `/plusplus-verify` 是 Harness 工作流 Prompt，会由当前会话模型执行对应插件工具。

## 查看报告

插件在当前仓库的 `.agent-context/` 写入本地运行报告：

- `.agent-context/sidecar/latest.md`：最近一次 idle 验证摘要；
- `.agent-context/traces/`：带 `eventId`、`sequence`、session/task 身份的执行证据；
- `.agent-context/runs/`：任务 context、编辑边界和验证状态；
- `.agent-context/loops/`：下一步和 blocker 决策。

这些目录是本地 runtime artifact，默认不进入 Git 或 npm 发布包。卸载插件不会删除仓库里的历史报告。

## 原理与边界

- EXE 只补丁经过 marker 检查的 `SessionPrompt.command` 分发器，并保留可恢复的 original backup。
- 插件观察 OpenCode 暴露的工具和事件；它不是操作系统沙箱，不能阻止其他程序修改文件。
- Guard 检查危险命令、未知脚本和受保护路径；Evidence 记录脱敏、截断后的结果，不代表完整业务正确性证明。
- state、session、trace 和 report 使用带锁原子写入；普通 artifact 写入故障不会让 OpenCode Desktop hook 崩溃。
- Windows 发布验证覆盖 EXE 大小、SHA256、插件 bundle 加载、三条本地命令、patch marker、backup 和卸载恢复。

详细说明：

- [Windows 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)
- [生成文件与提交策略](docs/reference/generated-files.zh-CN.md)
- [发布检查](docs/release.zh-CN.md)

## 开发者与兼容面

CLI 和 MCP 只保留用于源码开发、CI、诊断和兼容集成，不是普通用户安装或使用方式。开发者构建与完整检查见 [产品边界说明](docs/developer/product-boundary.zh-CN.md) 和 [发布检查](docs/release.zh-CN.md)。

确定性 Desktop benchmark 不调用付费模型：

```powershell
npm ci
npm run benchmark:desktop
```

许可证：[MIT](LICENSE)。
