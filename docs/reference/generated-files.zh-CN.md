# 生成文件与提交策略

[English](generated-files.md) | 中文

默认原则：提交帮助所有贡献者和 Agent 的稳定指导；不要提交本地 trace、sidecar report、tool evidence、cache、机器配置或未审阅的运行结果。

## 通常可以提交

- AGENTS.md、AGENTS.manual.md；
- repo-summary、onboarding、context-layers、key-files、module-map；
- contracts、稳定 index/graph、经过审阅的 regression memory；
- 团队共享的 OpenCode project commands/agents。

## 通常不要提交

- .agent-context/cache、traces、sidecar；
- runs 下的 transient iterations、worktrees 和 executor 输出；
- tool evidence、hallucination report、memory candidates；
- opencode-plusplus.local.yml；
- 用户配置目录中的全局插件和 state.json。

## 推荐 gitignore

```gitignore
.agent-context/cache/
.agent-context/traces/
.agent-context/sidecar/
.agent-context/runs/*/iterations/
.agent-context/worktrees/
.agent-context/delta/
.agent-context/memory/candidates/
opencode-plusplus.local.yml
```

OpenCode++ 自己保留部分 .agent-context 是为了 dogfooding 和测试，不表示所有下游仓库都应提交全部运行文件。
