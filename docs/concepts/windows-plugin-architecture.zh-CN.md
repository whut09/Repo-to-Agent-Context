# Windows 插件架构

[English](windows-plugin-architecture.md) | 中文

## 产品形态

OpenCode++ 只有一个面向普通用户的产品：按当前用户安装的 Windows x64 安装器。它注册一个全局 OpenCode 插件，并写入标准 `mode: primary` agent 文件。OpenCode Desktop 继续负责界面、模型、认证、会话生命周期和工具分发。

```text
OpenCode Desktop
  -> 选择 primary agent：opencode-plusplus
  -> OpenCode++ 插件工具和 hook
  -> 仓库 .agent-context 运行文件
```

模式 Prompt 会告诉当前模型何时调用 `retrieve`、`prepare`、`evaluate` 和 `next`。这些工具在插件进程内运行，不需要第二个模型、CLI 子进程或第二套 Desktop shell。

## 安装契约

EXE 写入：

```text
<配置目录>\plugins\opencode-plusplus.js
<配置目录>\agents\opencode-plusplus.md
<配置目录>\opencode-plusplus\state.json
<配置目录>\opencode-plusplus\installation.json
```

安装器按单文件原子方式写入，并在 state 文件有效时保留 enabled 状态。它会清理旧版本的命令文件；如果检测到旧 `app.asar` 补丁且同时存在 marker 和原始备份，会先恢复原文件。新版本安装器永远不修改 `app.asar`。

## 运行流程

1. OpenCode 加载全局插件，并从 `agents/opencode-plusplus.md` 发现 primary agent。
2. 模型调用 `retrieve`、`prepare`，获得相关文件、编辑边界、必跑命令和 task ID。
3. OpenCode 仍通过自己的工具执行读文件、编辑和 shell 调用。
4. 插件 hook 在执行前检查命令和路径，在执行后记录脱敏证据。
5. idle 验证和显式 `evaluate` 针对当前工作树重新计算 freshness、guard、policy、regression 和 convergence。
6. `next` 返回确定性动作。blocking action 不是完成。

## 可见 Harness 状态

每个渲染后的 Harness 结果都包含结构化可视化快照，同时写入 `.agent-context/sidecar/visualization.json`。快照展示阶段状态机、当前 decision 和下一步动作、文件选择边界、findings、所需 evidence、介入统计和最终总结。因此，即使 OpenCode 没有提供原生插件面板，`evaluate` 和 `next` 也会在正常 Desktop 工具结果中让用户看见插件的作用。

快照只包含可观察事实和确定性决策输入，不展示模型隐藏的思维链。命令结果、工作树 hash、finding、选中文件、Guard 结果和 decision 可以检查和复现；模型私有推理不能作为 evidence。

## 证据和持久化

插件记录 event identity、session/task identity、时间、命令结果、变更路径、working-tree hash 和脱敏输出。state、trace、report、session 使用共享 atomic store 和兼容 Windows 的锁。损坏 JSON 会返回可诊断状态，不会静默变成空状态。

仓库运行文件包括 `.agent-context/traces/`、`.agent-context/runs/`、`.agent-context/loops/`、`.agent-context/delta/` 和 `.agent-context/sidecar/`。它们不能进入发布包或 Git 提交。

## 硬边界

| 边界               | 含义                                             |
| ------------------ | ------------------------------------------------ |
| 不是沙箱           | 其他进程仍可修改文件或执行命令。                 |
| 不是模型           | 实际编码工作由 OpenCode 当前选择的模型完成。     |
| 不是语义证明       | 命令通过不等于业务正确。                         |
| 不是宿主 fork      | 安装器不修改 renderer 或 `app.asar`。            |
| 不是自动合并机器人 | 不会自动 commit、push、merge 或破坏性 rollback。 |

## 扩展点

Fork 可以定制 primary agent Prompt、retrieval ranker、命令/路径 Guard、evidence policy、loop convergence、decision arbitration 和 Desktop 工具处理。所有变更都应留在插件/runtime 边界内，增加对应契约测试，并说明新增信号能观察什么、不能观察什么。

详见 [OpenCode Desktop 安装](../integrations/opencode-desktop.zh-CN.md)、[总体架构](architecture.zh-CN.md) 和[生成文件](../reference/generated-files.zh-CN.md)。
