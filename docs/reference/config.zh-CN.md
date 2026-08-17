# 配置参考

[English](config.md) | 中文

默认配置为 opencode-plusplus.config.yml，本地私密配置为 opencode-plusplus.local.yml，后者不能提交。

## Windows 示例

```yaml
target: opencode
evidencePolicy: advisory
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

## 安全

提交的示例不得包含真实 baseUrl、apiKey、model 或 Windows 本地路径。真实凭据只放 local config 或环境变量。配置目录、插件状态和仓库 .agent-context 是不同边界，不要混淆。
