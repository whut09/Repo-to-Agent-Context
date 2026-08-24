# 快速开始

[English](getting-started.md) | 中文

OpenCode++ 适合“看起来合理”还不够的编码任务。它让当前 OpenCode 模型先获取仓库 context，遵守明确编辑边界，产生当前工作树上的证据，并说明任务为什么可以或不可以 finalize。

## 五分钟开始

1. 从 [Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 Windows EXE。
2. 退出 OpenCode Desktop，双击 EXE，重新启动 OpenCode。
3. 打开仓库，在模式选择器中选择 **OpenCode++**。
4. 像平常一样描述编码任务。
5. 需要查看证据或决策报告时打开 `.agent-context/`。

![OpenCode++ 模式](images/opencode-plusplus-mode.png)

## 运行时做什么

模式 Prompt 会引导当前模型在编辑前调用 `retrieve` 和 `prepare`，用内置 shell 执行 required command，并在编辑后调用 `evaluate` 和 `next`。如果检查过期、缺失、被禁止或连续多轮没有进展，Harness 会明确报告原因，而不是静默宣布成功。

## 什么时候定制

先使用默认模式。仓库如果需要不同的受保护路径、测试可信度、retrieval 权重、evidence policy 或循环停止规则，可以 fork 或扩展插件。为新规则增加测试，并保持 Windows 安装器和中英文文档同步。

CLI 和 MCP 只面向开发者和兼容集成，不是这条安装路径的必需品。
