# Retrieval Provider 参考

[English](retrieval.md) | 中文

Retrieval 是 provider protocol，不绑定单一 RAG 框架：

| Provider  | 状态            | 用途                                              |
| --------- | --------------- | ------------------------------------------------- |
| static    | Stable          | 搜索生成 context、文件、符号、summary 和 evidence |
| ripgrep   | Foundation      | 使用 rg 搜索源文本                                |
| hybrid    | Foundation      | 合并 static 和 ripgrep                            |
| codegraph | Foundation      | 可选的 .codegraph 项目适配器                      |
| lightrag  | Planned adapter | 当前支持 JSONL export，直接 server sync 规划中    |
| embedding | Planned adapter | 外部向量和 embedding 服务                         |

```powershell
opencode-plusplus retrieve "fix auth timeout" . --provider hybrid
opencode-plusplus retrieve "fix auth timeout" . --provider codegraph
opencode-plusplus rag export .
```

内部 graph 是可移植基础；CodeGraph、LightRAG 和 embedding 是可选深度检索后端。

## Context Registry 边界

Context Registry 是结构化项目指导来源，不是命令引擎，也不是 policy 引擎。每个 pack 具有稳定的 entry identity、source identity、package version、content revision、language、trust level、content hash 和主入口文件。本地 pack 支持带 frontmatter 的 `DOC.md` 或 `SKILL.md`，也支持 references、examples、errors 等 companion file。远程 source 默认关闭，显式开启后仍会检查超时、大小、hash、schema 和离线 fallback。

Retrieval 会综合 lexical 字段、symbol、dependency chain、source authority、quality、regression memory 和 task-specific negative examples。精确 entry ID 的优先级高于 quality 或 trust。每个 hit 都返回 score breakdown 和稳定排序。`relatedFiles` 表示有帮助的候选文件；`mustInspect` 是任务流程要求模型实际阅读的更小集合；`rejectedFiles` 解释为什么候选被明确排除。

## 增量 Context 获取

Context Registry 通过 Desktop 和兼容性集成共同使用的 application service 获取。搜索只返回排序后的 entry 元数据；Context 内容不能授予策略或命令权限。

获取 entry 支持三种模式：

- `entry`：只返回主入口 `DOC.md` 或 `SKILL.md`，并将附属文件列为 omitted。
- `file`：读取一个明确指定的附属文件，同时执行规范化路径和内容 hash 校验。
- `full`：返回主文件和所有可用附属文件。

每次获取都会报告 `selectedFiles`、`omittedFiles`、来源/版本/revision/hash、缓存状态、耗时和工作树 freshness。工作树变化后，返回内容前会重新构建并验证本地来源。Registry 的可信等级和文档只能作为辅助上下文；证明代码修改有效，仍必须依赖当前工作树上的 command 或 CI evidence。

默认 `entry` 获取是增量模式，不会加载所有 reference。需要某个附属文件时显式使用 `file`；需要完整内容时使用 `full`。获取结果可以是 reused、incremental 或 rebuilt，但 freshness 和 drift 检查仍会执行。cache hit 只表示安全复用了字节，不表示 Context 权威或在工作树变化后仍然新鲜。

## 本地 Annotation

OpenCode++ 可以保存仓库本地的环境限制、版本差异、常见失败原因、项目约定和已验证 workaround。Annotation 按仓库、Context entry、package version 和 content revision 隔离，并通过 atomic store 写入 `.agent-context/knowledge/annotations/`。

Fetch 默认只返回 `annotationAvailable` 和 stale 摘要，不自动注入正文。读取或注入必须显式请求。注入内容会标记为 `user-written`、`untrusted`、`context-only` 和 `not a command`，不能满足 evidence、关闭 Guard blocker 或获得命令权限。旧 package version 或 content revision 的 annotation 默认是 stale，必须显式允许后才能读取。

## 可信等级和失败规则

外部 Context 可以建议文件位置、API 版本、错误处理方式或历史 workaround，但不能满足测试、contract validation、freshness、forbidden-path 检查或 finalize 条件。Context 中出现的命令只作为不可信建议显示，绝不会自动执行。source trust 只影响排序和解释，不能覆盖 command 或 CI evidence。

Windows 会在读取 companion file 前规范化本地和配置 source 路径，支持包含空格或非 ASCII 字符的路径。路径穿越、文件缺失、registry JSON 损坏、revision 过期、权限失败、远程超时和网络不可用都会返回结构化诊断，不会静默变成空的成功结果。
