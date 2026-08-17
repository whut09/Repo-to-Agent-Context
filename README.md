# OpenCode++

中文 | [English](README.en.md)

**面向官方 OpenCode Desktop 的可靠性增强插件和 Harness。**

OpenCode++ 不修改 OpenCode Desktop 本体。它通过用户级 OpenCode 插件提供命令 Guard、工具证据、上下文验证、策略门禁和修复循环报告。

## 30 秒开始

1. 安装并打开官方 OpenCode Desktop。
2. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
3. 双击 EXE 安装，完全退出并重新打开 OpenCode Desktop。
4. 在 Desktop 中打开目标仓库并开始聊天。

安装器只写入当前用户的 OpenCode 配置目录，不要求管理员权限。日常不需要启动本项目的 CLI，也不需要安装额外的 OpenCode++ 桌面外壳。

## Desktop 内控制

插件加载后，在 OpenCode 聊天中可以调用：

```text
opencode_plusplus_status
opencode_plusplus_enable
opencode_plusplus_disable
```

也可以使用：

```text
/opencode-plusplus-status
/opencode-plusplus-on
/opencode-plusplus-off
```

启用时，OpenCode++ 会在工具执行前检查危险命令和受保护路径，在工具执行后记录退出码、输出摘要、会话和 working-tree hash，并在编辑后空闲时运行增量验证。禁用时控制工具仍然可用，只暂停这些保护和验证动作。

完整安装、升级、卸载和排障见 [官方 OpenCode Desktop 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)。

## 高级 Harness

需要 OpenCode++ 主导批处理循环时，仍可使用 CLI：

```powershell
opencode-plusplus oc run "修复登录超时并补回归测试" . --max-loops 3
opencode-plusplus oc report --last
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
```

CLI、MCP 和插件共享同一套 Guard、Evidence、Policy、Decision 和 Loop Engineering 实现。批处理模式会输出 `finalize`、`repair`、`repack`、`block`、`rollback` 或 `human-review` 决策。

## 从源码构建

```powershell
npm ci
npm run check
npm run build
npm run build:installer:windows
```

Windows 安装器输出在 `release/opencode-plusplus-setup-win-x64.exe`。它使用 Node SEA 将全局插件嵌入 EXE，不依赖仓库绝对路径。

## 文档

- [官方 OpenCode Desktop 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [OpenCode Global Sidecar](docs/integrations/opencode-sidecar.md)
- [总体架构](docs/concepts/architecture.md)
- [Agent-led 与 Harness-led](docs/concepts/integration-modes.zh-CN.md)
- [Loop Engineering](docs/concepts/loop-engineering.zh-CN.md)
- [CLI 命令参考](docs/reference/cli-reference.md)
- [MCP 工具](docs/reference/mcp-tools.md)
- [发布检查](docs/release.md)
