# Artifact 参考

[English](artifacts.md) | 中文

OpenCode++ 的 artifact 分为稳定仓库 context 和本地运行证据。稳定的 AGENTS、summary、index、graph、contracts 可按团队策略提交；trace、sidecar、cache、iteration 和 worktree 默认不提交。

## 运行时边界

仓库 `.agent-context/` 是本地运行边界，包含生成的 context、Context Registry 状态、cache、annotation、feedback、trace、intervention 和 loop report。这些文件解释插件做了什么，但不授予权限，也不默认适合提交到版本库。

## 主要目录

- .agent-context/tasks：任务 pack；
- .agent-context/runs：task run、iteration、prompt、decision；
- .agent-context/traces：执行 trace 和 command evidence；
- .agent-context/sidecar：Desktop 最新报告；
- .agent-context/contracts：编辑、命令、测试和安全边界；
- .agent-context/regression：经过审阅的历史问题和反回归记忆；
- .agent-context/cache：本地缓存；
- .agent-context/orchestrator：Harness 状态和报告。

## Context 和 Intervention 文件

| 位置                                           | 含义                                | 权限语义                        |
| ---------------------------------------------- | ----------------------------------- | ------------------------------- |
| `.agent-context/registry/context-pack.json`    | 合并后的本地 Context Registry pack  | 只能作为辅助 Context            |
| `.agent-context/cache/context-registry/`       | source snapshot 和获取缓存          | 可复用字节，仍需 freshness 检查 |
| `.agent-context/context-registry/usage/`       | 任务选中的 entry/file 和 provenance | 使用历史，不是 evidence         |
| `.agent-context/context-registry/feedback/`    | 本地质量标签和统计信号              | feedback，不能直接覆盖 decision |
| `.agent-context/knowledge/annotations/`        | 用户编写的仓库笔记                  | 不可信，不是 policy 或命令      |
| `.agent-context/interventions/<task-id>.jsonl` | Intervention Ledger 事件            | 解释记录，本身不是 proof        |
| `.agent-context/sidecar/latest.md`             | 最近一次人类可读摘要                | 展示 finding 和 evidence        |

插件使用 atomic store 写入 state、trace、report、registry、annotation 和 feedback。JSON 损坏、revision 冲突或 Windows 文件暂时被占用时会返回诊断，不会静默当成空的成功状态。运行时文件可能包含路径、hash、任务意图、命令 metadata 或脱敏输出，应排除在提交之外。

## Windows 插件文件

用户 OpenCode 配置目录下的 plugins、commands、state.json 和 installation.json 由 Windows EXE 管理，不属于仓库 artifact。卸载插件不会删除仓库 .agent-context。

敏感 evidence 仍可能暴露命令、路径、hash、输出预览和任务意图。即使已脱敏，也应将 traces、sidecar 和 runtime iterations 加入 gitignore。
