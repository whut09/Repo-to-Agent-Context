# Context Feedback

[English](context-feedback.md) | 中文

Context feedback 用于评价 Context entry、附属文件、检索结果或 intervention 建议是否有用。它是质量信号，不是验证证据。

## 标签

支持 `useful`、`not-useful`、`outdated`、`inaccurate`、`incomplete`、`wrong-version`、`wrong-example` 和 `irrelevant`。

每条记录只包含 `entryId`、source、可选版本、内容 revision、可选相对文件、目标标识、label、生成 ID 和时间戳。不包含任务原文、源码、文件正文、仓库绝对路径、凭据或任意评论。

## Desktop 使用

OpenCode Desktop 提供 `opencode_plusplus_context_feedback`，在使用 Context 后显式调用：

```json
{
  "entryId": "official/payments",
  "source": "official",
  "version": "2.0.0",
  "revision": 3,
  "target": "entry",
  "label": "useful"
}
```

工具写入本地反馈，并返回当前本地统计和网络提交状态。它不会调用模型。开发兼容用途的 MCP 入口复用同一个 application service。

## 存储

反馈通过 atomic store 写入 `.agent-context/context-registry/feedback/`。store 包含 `schemaVersion` 和 `revision`；重复 feedback ID 幂等，损坏 JSON 返回诊断，不会被当成空结果。

本地 annotation 仍保存在 `.agent-context/knowledge/annotations/`。annotation 是用户编写、可显式注入但始终不可信的 Context；feedback 是面向维护者的质量元数据，永远不会注入模型上下文。

## 网络边界

只有同时显式配置 `feedback.telemetry`、`feedback.network` 和 `feedback.endpoint` 才会发送网络反馈。网络只发送相同的安全元数据；endpoint URL 不能包含凭据。离线或发送失败不会删除本地记录。

## 排序边界

反馈统计默认不影响检索。设置 `feedback.useLocalQualitySignals: true` 后，检索的 `localFeedback` 分项会使用有边界的轻量分数。它不能覆盖 exact ID，也没有命令、evidence、Guard、Policy、intervention 或 finalize 权限。
