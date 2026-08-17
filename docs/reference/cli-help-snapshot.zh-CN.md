# CLI Help Snapshot 中文说明

[English generated snapshot](cli-help-snapshot.md) | 中文

英文快照由 CLI 文档生成器从当前命令注册表产生，是命令帮助的机器规范输出，不手工翻译。本文提供中文导航；具体参数和默认值以英文快照及当前 CLI --help 为准。

## Windows 常用命令

```powershell
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
opencode-plusplus opencode doctor .
opencode-plusplus orchestrate "任务" . --executor mock --max-loops 3
```

## 命令组

- context/build：扫描仓库并写入 context；
- task/plan/pack/run：生成任务边界和执行上下文；
- tests/impact/verify/policy：验证证据、影响和 policy；
- trace/hallucination/regression：记录证据并检查幻觉、历史回归；
- orchestrate/agent/opencode/oc：Harness-led executor 流程；
- mcp：启动 stdio MCP server；
- benchmark/release：确定性测试和发布检查。

CLI 不是 Desktop UI 的替代品。Windows 日常使用请安装 EXE，并在 OpenCode 聊天中使用插件工具。
