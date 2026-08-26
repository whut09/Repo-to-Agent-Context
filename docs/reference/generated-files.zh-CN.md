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
- 用户配置目录中的全局插件、state.json 和 `agents/opencode-plusplus.md` 模式文件。
- `.agent-context/context-registry/usage`、`.agent-context/context-registry/feedback`；
- `.agent-context/knowledge/annotations`、`.agent-context/interventions`。

四类文件边界不同：usage 记录获取了哪些 Context；feedback 只记录固定质量标签；annotation 保存用户编写的本地知识；intervention 记录 Harness 介入。它们都不能单独作为验证 evidence。

## Desktop 发布输出

Windows 构建在 `release/` 下生成 EXE、SHA256 文件和 `opencode-plusplus-release.json`。manifest 记录 `package.json` 版本、平台、架构、体积阈值、digest、plugin bundle 大小、`opencode-plusplus` mode 和旧版本清理契约。这些文件用于 GitHub Release，已被 Git 忽略，也不会进入 npm 开发包。

`npm run benchmark:desktop` 生成 `benchmarks/results/desktop/result.json` 与 `result.md`。它们是 CI/runtime 结果，不是源码、npm 包内容或 Release asset。

## 推荐 gitignore

```gitignore
.agent-context/cache/
.agent-context/traces/
.agent-context/sidecar/
.agent-context/runs/
.agent-context/loops/
.agent-context/orchestrator/
.agent-context/worktrees/
.agent-context/delta/
.agent-context/memory/candidates/
.agent-context/context-registry/usage/
.agent-context/context-registry/feedback/
.agent-context/knowledge/annotations/
.agent-context/interventions/
opencode-plusplus.local.yml
```

OpenCode++ 自己保留部分 .agent-context 是为了 dogfooding 和测试，不表示所有下游仓库都应提交全部运行文件。
