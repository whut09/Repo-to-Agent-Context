# OpenCode++

[English](README.en.md) | 中文

**面向官方 OpenCode Desktop 的 Windows 插件、证据层和 Harness。**

OpenCode++ 不修改或替换官方 OpenCode Desktop，也不安装第二个桌面外壳。Windows EXE 只把一个自包含的全局插件、三个控制命令和状态文件安装到当前用户的 OpenCode 配置目录。安装之后，日常操作在 OpenCode Desktop 的聊天界面中完成。

## 五分钟安装

1. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 完全退出 OpenCode Desktop。
3. 双击 EXE，等待安装完成。
4. 重新打开 OpenCode Desktop，打开目标仓库并新建会话。
5. 在聊天中调用 `opencode_plusplus_status`，或输入 `/opencode-plusplus-status`。

安装器只写当前 Windows 用户目录，不需要管理员权限。默认位置为 `%USERPROFILE%\.config\opencode`；如果 OpenCode 使用 `OPENCODE_CONFIG_DIR` 或 `XDG_CONFIG_HOME`，插件会安装到对应目录。

## 在 OpenCode 中控制

| 操作     | 插件工具                    | Slash Command               |
| -------- | --------------------------- | --------------------------- |
| 查看状态 | `opencode_plusplus_status`  | `/opencode-plusplus-status` |
| 启用     | `opencode_plusplus_enable`  | `/opencode-plusplus-on`     |
| 禁用     | `opencode_plusplus_disable` | `/opencode-plusplus-off`    |

启用时，插件在工具执行前检查危险命令、未知脚本和受保护路径；工具执行后记录退出码、脱敏输出、会话和 working-tree hash；会话空闲时运行增量验证。禁用只暂停保护、证据和空闲验证，控制工具仍然可用。

## 原理和边界

- EXE 不修改 OpenCode Desktop 二进制、安装目录、renderer、更新器或账户登录。
- 当前 OpenCode 插件 API 没有公开的第三方设置面板扩展点，因此开关和状态通过插件工具与 Slash Command 暴露。
- 插件只观察 OpenCode 暴露的工具和事件，不是操作系统级沙箱，不能阻止其他程序修改文件。
- Guard 是命令和路径边界，不等同于完整安全审计；不透明的工具参数可能只能产生证据或告警。
- Evidence 会脱敏并截断输出；它证明系统捕获了什么，不保证测试覆盖所有业务行为。
- 仓库运行时报告写入目标仓库的 `.agent-context/`；卸载插件不会删除这些历史 artifact。

更完整的运行结构见 [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)。

## 安装文件和仓库文件

用户级安装文件：

```text
%USERPROFILE%\.config\opencode\plugins\opencode-plusplus.js
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-on.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-off.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-status.md
%USERPROFILE%\.config\opencode\opencode-plusplus\state.json
```

目标仓库中的 Harness 文件位于 `.agent-context/`，包括 context、trace、evidence、policy、guard、loop 和 orchestrator artifact。它们不是 OpenCode Desktop 安装文件。

## 升级、关闭和卸载

- **升级**：退出 OpenCode，下载新 EXE 并再次双击。安装器覆盖插件和命令文件，保留有效的启用状态。
- **临时关闭**：在 OpenCode 中使用 `/opencode-plusplus-off`；之后用 `/opencode-plusplus-on` 恢复。
- **卸载**：使用 EXE 的 `--uninstall`。它只删除 OpenCode++ 写入的插件、命令、状态和安装清单，不删除仓库 `.agent-context/`。
- **验证状态**：使用 EXE 的 `--status --json`，或在 OpenCode 中调用状态工具。

## 高级 Harness 和 CLI

CLI 不是 Desktop 插件的日常入口。它用于 CI、仓库 context 生成、诊断、MCP 服务和 Harness-led 批处理：

```powershell
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus orchestrate "修复登录超时并补回归测试" . --executor mock --max-loops 3
```

CLI、MCP 和 Desktop 插件共享 Guard、Evidence、Policy、Decision 和 Loop Engineering 实现，但控制边界不同：Desktop 插件观察当前 OpenCode 会话；Harness-led CLI 才负责多轮执行、收集和终止决策。

## 从源码构建 Windows EXE

需要 Windows、Node.js 20+ 和 npm：

```powershell
npm ci
npm run check
npm run build
npm run build:installer:windows
```

输出为 `release/opencode-plusplus-setup-win-x64.exe` 和对应的 `.sha256`。构建使用 Node SEA 和 `postject`，插件代码嵌入 EXE，不依赖本机仓库绝对路径。

## 文档

- [Windows 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Windows 插件架构与边界](docs/concepts/windows-plugin-architecture.zh-CN.md)
- [全局 Sidecar 运行机制](docs/integrations/opencode-sidecar.zh-CN.md)
- [总体架构](docs/concepts/architecture.zh-CN.md)
- [集成模式](docs/concepts/integration-modes.zh-CN.md)
- [Loop Engineering](docs/concepts/loop-engineering.zh-CN.md)
- [CLI 参考](docs/reference/cli-reference.zh-CN.md)
- [配置参考](docs/reference/config.zh-CN.md)
- [发布检查](docs/release.zh-CN.md)

许可证：[MIT](LICENSE)。
