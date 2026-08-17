# 产品定位

[English](positioning.md) | 中文

OpenCode++ 是 OpenCode 的外部可靠性 Harness，不是新的 coding agent，也不是官方 OpenCode 团队的产品。官方 OpenCode 负责模型、对话、工具调用和实际编辑；OpenCode++ 提供 context、编辑边界、执行证据、policy、影响分析、回归保护和 repair/finalize 报告。

## OpenCode++ 负责什么

- 仓库扫描、索引、依赖图和任务相关 context；
- allowed/avoid 编辑边界及受保护路径；
- command、test、CI、manual evidence 记录和可信等级；
- contract、policy、impact、hallucination、regression、freshness 和 drift 检查；
- 确定性的 Guard Gate 仲裁、收敛检测和下一步决策；
- Windows OpenCode Desktop 全局插件的 Sidecar 报告。

## OpenCode++ 不负责什么

- 不提供模型登录、计费或账号管理；
- 不替代 OpenCode Desktop UI，也不增加自己的 Electron/TUI；
- 不拥有宿主通用工具调用运行时；
- 不把命令成功当作语义正确；
- 不自动提交、推送、合并或破坏性回滚用户工作树；
- 不阻止其他应用绕过 OpenCode 直接修改文件。

## 三种入口

| 入口              | 控制者           | Windows 用途                                  |
| ----------------- | ---------------- | --------------------------------------------- |
| Desktop Sidecar   | OpenCode Desktop | 日常交互、工具前 Guard、工具后证据、idle 验证 |
| Agent-led CLI/MCP | 外部 Agent       | Agent 主动调用 OpenCode++，结果默认是建议     |
| Harness-led CLI   | OpenCode++       | CI 或批处理，拥有有界循环和终止决策           |

原理和硬边界见 [Windows 插件架构与边界](windows-plugin-architecture.zh-CN.md)。
