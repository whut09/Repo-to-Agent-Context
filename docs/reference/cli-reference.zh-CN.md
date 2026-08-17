# CLI 参考

[English](cli-reference.md) | 中文

CLI 是 Windows 维护、CI、MCP 和 Harness 自动化入口；官方 OpenCode Desktop 的日常交互使用全局插件，不需要每天打开命令行。

## Windows 安装器

```powershell
opencode-plusplus-setup-win-x64.exe --status --json
opencode-plusplus-setup-win-x64.exe --enable --json
opencode-plusplus-setup-win-x64.exe --disable --json
opencode-plusplus-setup-win-x64.exe --uninstall --json
opencode-plusplus-setup-win-x64.exe --config-dir "C:\Temp\opencode-config" --status --json
```

## 仓库 Context

```powershell
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus plan "修复登录超时" .
opencode-plusplus pack "修复登录超时" .
opencode-plusplus run "修复登录超时" .
```

## 验证和证据

```powershell
opencode-plusplus trace run <trace-id> . --action run-test --command "npm test"
opencode-plusplus tests . --diff --base main
opencode-plusplus impact . --base main
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --trace <trace-id> --fail-on required
```

## Harness-led

```powershell
opencode-plusplus orchestrate "任务" . --executor mock --max-loops 3 --checkpoint git-worktree
opencode-plusplus opencode doctor .
opencode-plusplus opencode run "任务" . --max-loops 3 --fail-on required
opencode-plusplus agent run "任务" . --executor mimocode --executor-command "mimocode run {prompt}"
```

Harness 阶段是 Plan、PrepareSandbox、Execute、Collect、Evaluate、Decide、Persist 和 Finalize/Continue。它写 iteration artifact、trace、policy、guard gates、decision 和 convergence。

## 重要边界

- 默认 executor 命令按 argv 解析且不经过 shell；
- Windows 路径空格、中文和反斜杠会被保留；
- shell 控制符会被拒绝；
- Agent-led 工具结果默认是建议；
- strict/balanced evidence policy 可能拒绝 manual-only evidence；
- CLI 不会自动 commit、push、merge 或破坏性 rollback。

完整选项见 [英文 CLI reference](cli-reference.md) 和机器生成的 [CLI help snapshot](cli-help-snapshot.md)。
