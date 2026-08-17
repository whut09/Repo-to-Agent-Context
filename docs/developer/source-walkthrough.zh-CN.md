# 源码导读

[English](source-walkthrough.md) | 中文

## 主链路

```text
CLI / MCP adapter -> application service -> core scan/index/graph/rank -> harness verification -> output/artifact repository
```

Harness-led 链路为：

```text
orchestrate -> task/context -> executor adapter -> trace normalizer -> Guard/policy -> decision/convergence -> persisted report
```

关键目录：

- src/application/：CLI 与 MCP 共用的 context、task、retrieval、verification service；
- src/core/：扫描、索引、图、rank、缓存、freshness、atomic store；
- src/harness/：control plane、verification plane、phase、trace；
- src/outputs/：artifact 和 markdown/json renderer；
- src/integrations/opencode/：Windows global plugin、sidecar guard、evidence、idle verify；
- src/installer/：Windows per-user EXE 安装逻辑。

Windows 插件入口是 src/integrations/opencode/global-plugin.ts；安装器通过 esbuild 打包后嵌入 EXE，不应重新引入仓库绝对路径或项目级生成插件。
