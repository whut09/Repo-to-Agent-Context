# Artifact 参考

[English](artifacts.md) | 中文

OpenCode++ 的 artifact 分为稳定仓库 context 和本地运行证据。稳定的 AGENTS、summary、index、graph、contracts 可按团队策略提交；trace、sidecar、cache、iteration 和 worktree 默认不提交。

## 主要目录

- .agent-context/tasks：任务 pack；
- .agent-context/runs：task run、iteration、prompt、decision；
- .agent-context/traces：执行 trace 和 command evidence；
- .agent-context/sidecar：Desktop 最新报告；
- .agent-context/contracts：编辑、命令、测试和安全边界；
- .agent-context/regression：经过审阅的历史问题和反回归记忆；
- .agent-context/cache：本地缓存；
- .agent-context/orchestrator：Harness 状态和报告。

## Windows 插件文件

用户 OpenCode 配置目录下的 plugins、commands、state.json 和 installation.json 由 Windows EXE 管理，不属于仓库 artifact。卸载插件不会删除仓库 .agent-context。

敏感 evidence 仍可能暴露命令、路径、hash、输出预览和任务意图。即使已脱敏，也应将 traces、sidecar 和 runtime iterations 加入 gitignore。
