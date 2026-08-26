# 配置参考

[English](config.md) | 中文

默认配置为 opencode-plusplus.config.yml，本地私密配置为 opencode-plusplus.local.yml，后者不能提交。

## Windows 示例

```yaml
target: opencode
evidencePolicy: advisory
feedback:
  enabled: true
  telemetry: false
  network: false
  useLocalQualitySignals: false
tokenBudget: 60000
agents:
  mode: minimal
  maxTokens: 1200
outputs:
  agents: true
  modules: true
  graph: true
  tasks: true
  readiness: true
  rag: true
```

## Evidence Policy

- advisory：兼容旧行为，manual evidence 可以满足要求，但必须标为 claim，不等同系统验证；
- balanced：非关键检查可以使用 manual evidence；源代码或配置修改后，测试至少需要 Harness command 或 CI evidence；
- strict：测试和 contract validation 必须是当前 working-tree 的 Harness command 或有效 CI evidence，manual 只能辅助。

默认仍是 advisory，避免旧配置行为变化。CLI 使用 evidence-policy，MCP runtime 使用 evidencePolicy。

## Context Feedback

`feedback.enabled` 控制本地 Context 质量反馈，默认开启。记录只包含 entry/source/version/revision/file 标识和固定 label，不保存任务原文、源码内容、仓库绝对路径或 secret。

`feedback.telemetry` 与 `feedback.network` 默认都关闭。只有两者均显式开启，并且 `feedback.endpoint` 是不含内嵌凭据的 HTTP(S) URL 时，才会提交网络反馈。网络失败不会删除本地反馈。

`feedback.useLocalQualitySignals` 默认关闭。开启后，本地 useful/not-useful 统计只提供有边界、可解释的轻量排序信号，不能覆盖 exact Context ID，也不能影响 evidence、Guard、Policy 或 finalize。

本地 annotation 与维护者 feedback 是两类数据：annotation 是可显式注入但始终不可信的仓库知识；feedback 是质量元数据，不会注入模型上下文。

## 安全

提交的示例不得包含真实 baseUrl、apiKey、model 或 Windows 本地路径。真实凭据只放 local config 或环境变量。配置目录、插件状态和仓库 .agent-context 是不同边界，不要混淆。
