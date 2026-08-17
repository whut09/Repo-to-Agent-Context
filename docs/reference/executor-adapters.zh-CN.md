# Executor Adapter 参考

[English](executor-adapters.md) | 中文

Executor adapter 让 Harness 把外部 coding agent 当成可替换执行器。

| Adapter                      | 状态       | 说明                                                  |
| ---------------------------- | ---------- | ----------------------------------------------------- |
| mock                         | Stable     | 确定性测试和 CI，不代表真实 Agent。                   |
| OpenCode preset              | Foundation | Windows OpenCode 命令和 JSON/transcript normalizer。  |
| generic executor-command     | Foundation | 可接 OpenCode、Codex、Claude Code、Cursor、MiMoCode。 |
| MiMoCode/Codex/Claude native | Planned    | 当前使用 generic command。                            |

占位符包括 prompt、task、repo、runDir、agent。命令按 argv 解析且不经过 shell，Windows 路径空格和非 ASCII 必须保持。复杂多步操作应封装为脚本并直接调用。
