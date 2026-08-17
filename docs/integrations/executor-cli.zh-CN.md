# Executor CLI 集成

[English](executor-cli.md) | 中文

Executor 是 Harness 调用的外部代码 Agent。OpenCode++ 负责 prompt、sandbox、命令解析、trace、policy、Guard 和决策；executor 负责实际编辑。

## OpenCode

Windows 推荐使用内置 preset：

```powershell
opencode-plusplus opencode doctor .
opencode-plusplus opencode run "修复登录超时并补回归测试" . --max-loops 3
```

通用 adapter 使用 --executor-command 和 prompt、task、repo、runDir、agent 占位符。参数按 argv 解析，不经过 shell；Windows 路径中的空格、中文和反斜杠必须保持原样。控制符 &&、|、>、<、; 和反引号会被拒绝。

## Sandbox 和失败边界

--checkpoint git-worktree 在隔离 worktree 执行，导出 patch 和 trace。executor 失败、阶段异常或恢复后都必须清理 sandbox；Harness 记录 rollback decision，但不对用户主工作树执行 destructive reset。
