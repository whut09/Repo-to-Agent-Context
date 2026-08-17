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
