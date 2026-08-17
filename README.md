# OpenCode++

中文 | [English](README.en.md)

**为 OpenCode 增加上下文、边界、证据、验证与修复闭环的可靠性增强层。**

OpenCode++ 不是 OpenCode 官方项目，也不替代 OpenCode。OpenCode 负责聊天、读代码、改代码、跑命令；OpenCode++ 负责上下文增强、编辑边界、命令证据、策略门禁、影响分析和修复/完成决策报告。

```txt
OpenCode 负责聊天、读代码、改代码、跑命令。
OpenCode++ 负责上下文、边界、证据、门禁、影响分析和修复/完成决策报告。
```

## 30 秒开始

在本机终端里全局安装 OpenCode++ 和 OpenCode：

```bash
npm i -g opencode-plusplus opencode-ai
```

然后进入你要使用 OpenCode++ 的目标代码仓库：

```bash
cd your-repo
opencode-plusplus
```

然后像使用 OpenCode 一样聊天：

```txt
帮我修复登录超时 bug
给这个模块补单测
重构这个函数并保持行为不变
```

OpenCode++ 会在外层安静运行：

- 初始化并增量刷新仓库上下文
- 检查编辑边界
- 阻断危险命令和幻觉命令
- 在执行前阻断 protected / secret path
- 记录 sidecar 事件、命令结果和验证证据
- OpenCode 空闲且有 dirty diff 时执行增量验证
- 复用 contracts / hallucination / regression / impact / tests / policy Guard 栈
- 输出影响范围、回归风险和最新验证报告

默认不打断聊天，只有发现 blocker 时才提醒。

## 日常命令

```bash
opencode-plusplus          # 进入 OpenCode 聊天模式，并自动启用 OpenCode++ sidecar
opencode-plusplus report   # 查看最近一次检查结果
opencode-plusplus status   # 查看 sidecar 是否 active
opencode-plusplus doctor   # 诊断 OpenCode / auth / git / context / plugin version
opencode-plusplus --pure   # 纯 OpenCode，不启用 OpenCode++
```

`opencode-plusplus` 会执行 preflight，确保 `.agent-context`，写入 `.opencode/plugins/opencode-plusplus.ts`，准备 OpenCode commands/agent 文件，先打印简短状态，再进入当前仓库的 OpenCode TUI。sidecar plugin 会监听 `tool.execute.before`、`tool.execute.after`、`file.edited` 和 `session.idle`：执行危险命令、幻觉 package script / Makefile target、触碰 protected / secret path 时会前置阻断；工具执行结束后会记录 command、exit code、stdout/stderr hash、working tree hash 和 touched files；OpenCode 空闲且有 dirty diff 时会自动运行增量验证，写入 `.agent-context/sidecar/latest.json` 和 `.agent-context/sidecar/latest.md`。

## Windows / TUI 长文本输入

OpenCode++ 继续使用 OpenCode 原生 TUI，不做 Desktop 替代，也不嵌入 TUI。长文本输入有三种方式：

1. 直接输入：短 prompt 直接在 OpenCode TUI 里输入。
2. `/editor`：先运行 `opencode-plusplus setup-editor`。Windows 下会按 `code --wait`、`cursor --wait`、`notepad` 的优先级写入用户级 `EDITOR` 环境变量；然后在 TUI 里使用 `/editor` 或 `Ctrl+X E`。
3. `/clip`：先运行 `opencode-plusplus install-commands` 写入 `.opencode/commands/clip.md`，复制长文本后运行 `opencode-plusplus clip`，内容会写入 `.opencode-plusplus/clipboard/latest.md`，再在 TUI 里执行 `/clip`。

详见 [TUI 粘贴指南](docs/tui-paste.md)。

## 官方 OpenCode Desktop 集成

如果只是想在官方 OpenCode Desktop 中开发本仓库，直接在 Desktop 的项目列表中选择“打开文件夹”，然后选择 `E:\codex\opencode-plusplus`，不需要命令行。

如果还要在 Desktop 中启用 OpenCode++ 的 Guard、Evidence 和 Harness 能力，需要注意：当前 OpenCode Desktop 没有图形化插件市场，官方插件机制仍通过项目 `.opencode/plugins/` 或 `opencode.json` 加载。因此需要先从当前源码构建并全局安装一次后端，再为目标仓库注册项目插件：

```powershell
cd E:\codex\opencode-plusplus
npm ci
npm run build
npm install --global .

cd E:\projects\your-project
opencode-plusplus desktop init .
```

然后在官方 OpenCode Desktop 中重新打开该仓库。Desktop 会加载 `.opencode/plugins/opencode-plusplus.ts`，正常聊天即可获得命令/路径 Guard、执行证据和空闲增量验证，不需要从 `opencode-plusplus` 启动 TUI。

该命令发布到 npm 后也可以使用 `npm install --global opencode-plusplus@latest`。完整的升级、卸载、生成文件策略和 Windows `PATH` 排障请阅读 [官方 OpenCode Desktop 安装与使用指南](docs/integrations/opencode-desktop.zh-CN.md)。

## Desktop MVP

OpenCode++ Desktop 是实验性桌面入口，代码位于 `apps/desktop`，适合不想使用 OpenCode TUI / 命令行的用户。做 Desktop 的主要原因，是 OpenCode TUI 在 Windows / 终端环境里复制粘贴、多行任务输入、长文本编辑和输出查看体验不稳定；尤其是从网页、文档或 issue 里复制大段任务时，容易出现换行、引号、快捷键和焦点问题。

当前能力：

- 选择 repo
- 输入任务
- 调用 OpenCode++ Harness
- 实时查看 stdout/stderr
- 停止任务
- 打开 orchestrator report

当前限制：

- 仍依赖本机可用的 `opencode-plusplus` CLI
- 还没有打包 exe
- 暂不内置 diff viewer
- 暂不支持多会话
- 暂不替代 OpenCode Desktop

开发运行：先在仓库根目录构建并链接 CLI，再进入 `apps/desktop` 安装依赖、构建并启动 Electron shell。Desktop MVP 不嵌入 OpenCode TUI，而是调用 `opencode-plusplus.cmd oc run --repo "<repo>" --max-loops 2 --stream-executor -- "<task>"`；OpenCode 仍然作为 executor 执行代码任务，OpenCode++ Desktop 负责提供更可靠的输入/输出界面和 Harness 结果展示。

详见 [Desktop MVP](docs/desktop.md)。

## 高级用法

首页主路径只推荐 `opencode-plusplus`。批处理 Harness Mode、CI-like executor、手动 `verify / policy / impact`、MCP 和 retrieval 等内核能力保留给高级用户：

- [OpenCode Transparent Sidecar Mode](docs/integrations/opencode-sidecar.md)
- [官方 OpenCode Desktop 安装与使用](docs/integrations/opencode-desktop.zh-CN.md)
- [Desktop MVP](docs/desktop.md)
- [Executor CLI Integration](docs/integrations/executor-cli.md)
- [CLI Reference](docs/reference/cli-reference.md)
- [MCP Tools](docs/reference/mcp-tools.md)

## 与相关项目的关系

| 项目                          | 主要职责                              | 与 OpenCode++ 的关系                                       |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Codex / Claude Code / Cursor  | 读代码、改代码、跑命令                | 作为 executor，OpenCode++ 提供外层验证和约束               |
| OpenCode / MiMoCode           | 开源 coding agent runtime / assistant | 重点 executor 接入方向，OpenCode++ 补充 harness gate       |
| CodeGraph                     | 代码图谱 / symbol / call graph / MCP  | 可作为可选深度代码理解 backend                             |
| OpenHarness / Oh My OpenAgent | 通用 agent harness / workflow         | 同属 harness 方向，OpenCode++ 更聚焦 coding agent 可靠闭环 |

## 解决什么问题

- OpenCode 不知道该读哪些文件，靠猜入口和模块。
- OpenCode 修改范围失控，误改 generated、lockfile、CI、migration 或无关模块。
- OpenCode 生成不存在的 API、命令、配置、环境变量或项目约定。
- OpenCode 声称测试通过，但没有可信的 exit code / timestamp / working tree hash 证据。
- OpenCode 改完影响范围不可见，review 风险难判断。
- OpenCode 重复引入历史 bug，repair loop 不知道何时停止。

## 当前能力成熟度

| 能力                                             | 当前状态         | 说明                                                                               |
| ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------- |
| `opencode-plusplus` OpenCode TUI launcher        | MVP              | 可 preflight、打印短状态、启动 OpenCode TUI，并支持 `--pure`                       |
| OpenCode transparent sidecar plugin              | MVP              | 注入 `.opencode/plugins/opencode-plusplus.ts`，监听 session / file / tool 事件     |
| sidecar command guard                            | MVP+             | 支持危险命令、未知 package script / Makefile target、protected / secret path       |
| sidecar post-tool evidence                       | Foundation       | 通过 `tool.execute.after` 记录 exit code、时间、输出 hash、working-tree hash       |
| sidecar verify / shared guard stack              | Foundation       | 复用 contracts、hallucination、regression、impact、tests、policy，仍需更多实仓验证 |
| `opencode-plusplus report/status/doctor`         | Foundation       | 可读取 sidecar 报告、检查 active 状态、诊断 OpenCode / auth / git / context        |
| batch OpenCode executor / `opencode-plusplus oc` | Foundation       | 适合 benchmark、CI-like run、非交互任务和可重复 demo                               |
| bounded harness-led orchestrator / `orchestrate` | Foundation       | 支持多轮 artifacts、checkpoint、executor command、decision report                  |
| `build` / `AGENTS.md` / `.agent-context`         | Stable           | 仓库上下文编译与生成产物稳定                                                       |
| task plan / pack / run                           | Stable           | 任务级上下文、边界、prompt、trace 文件稳定                                         |
| TypeScript Compiler API analyzer                 | Stable           | TypeScript / JavaScript 分析主路径稳定                                             |
| Python AST / optional Tree-sitter analyzer       | Foundation       | Python 分析可用，Tree-sitter 为可选增强                                            |
| Hallucination Guard                              | MVP              | 覆盖缺失文件、命令、依赖、配置、symbol 的确定性检查                                |
| Regression Guard / memory candidates             | MVP / Foundation | 有结构化 regression memory 和候选写入流程                                          |
| MCP stdio server + core tools                    | Foundation       | MCP 基础工具可用，端到端客户端集成仍需逐项验证                                     |
| MCP Agent Native Runtime tools                   | Experimental     | start/step/evaluate/repair/finalize 仍属实验能力                                   |
| MiMoCode / Codex / Claude native normalizers     | Planned          | 计划补齐更多真实 agent transcript / JSONL normalizer                               |
| RAG export / retriever provider interface        | Foundation       | 已有导出和 provider 接口                                                           |
| direct LightRAG server sync                      | Planned          | 计划中                                                                             |

完整成熟度说明见 [文档首页](docs/README.md)。

## 文档导航

- [5 分钟跑通](docs/getting-started.md)
- [项目定位](docs/concepts/positioning.md)
- [总体架构](docs/concepts/architecture.md)
- [Guard 模块](docs/concepts/guard-modules.zh-CN.md)
- [Agent-led vs Harness-led](docs/concepts/integration-modes.zh-CN.md)
- [Loop Engineering 源码链路](docs/concepts/loop-engineering.zh-CN.md)
- [CLI 命令参考](docs/reference/cli-reference.md)
- [生成文件与提交策略](docs/reference/generated-files.md)
- [输出结构说明](docs/reference/artifacts.md)
- [Executor Adapter 状态](docs/reference/executor-adapters.md)
- [Benchmark 指南](docs/developer/benchmark-guide.md)
- [Roadmap](docs/roadmap.zh-CN.md)

## 致谢

OpenCode++ 的设计受到 [OpenAI Codex](https://github.com/openai/codex)、[OpenCode](https://github.com/anomalyco/opencode)、[MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)、[CodeGraph](https://github.com/colbymchenry/codegraph)、[Oh My OpenAgent](https://github.com/code-yeongyu/oh-my-openagent)、[OpenHarness](https://github.com/HKUDS/OpenHarness) 和 [OpenClaw](https://github.com/openclaw/openclaw) 等项目启发。
