# Windows 官方 OpenCode Desktop

[English](opencode-desktop.md) | 中文

OpenCode++ 作为全局用户级插件安装到官方 OpenCode Desktop。用户真正使用的入口只有一个 primary agent mode：**OpenCode++**。安装器不增加 Slash Command，也不修改 `app.asar`。

## 安装

1. 完全退出 OpenCode Desktop。
2. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
3. 双击 EXE，等待确认窗口。

![安装器确认窗口](../images/opencode-plusplus-installer.png)

4. 重启 OpenCode Desktop。
5. 打开一个仓库，在模式选择器中选择 **OpenCode++**。

![模式选择器](../images/opencode-plusplus-mode.png)

安装器按当前用户安装，不需要管理员权限。默认使用 `%USERPROFILE%\.config\opencode`；设置 `OPENCODE_CONFIG_DIR` 时优先使用它。

## 安装内容

```text
<OpenCode 配置目录>\plugins\opencode-plusplus.js
<OpenCode 配置目录>\agents\opencode-plusplus.md
<OpenCode 配置目录>\opencode-plusplus\state.json
<OpenCode 配置目录>\opencode-plusplus\installation.json
```

agent 文件是标准 OpenCode `mode: primary` agent。OpenCode 会从全局 `agents` 目录发现它，并在模式选择器中和 Build、Plan 一起显示。插件和 agent 文件是两个独立部分，模式 Prompt 与运行时工具不会混在一起。

## 使用模式

选择模式后，像平时一样描述任务。模式会要求当前 OpenCode 模型：

1. 需要时先检索相关文件；
2. 准备任务并阅读所有 `mustInspect` 文件；
3. 只在返回的边界内编辑；
4. 用内置 shell 跑完所有 required command；
5. 按当前工作树 freshness 评估证据；
6. 持续执行 `next`，直到 Harness 返回 `finalize` 或 human review。

真正读文件、改代码和执行命令的仍是当前 OpenCode 模型。OpenCode++ 提供 context、规则、证据和决策工具；Desktop 插件不会启动第二个模型，也不会调用自己的 CLI。

## 状态和报告

插件状态写在 OpenCode 配置目录。仓库运行文件写在 `.agent-context/`：

- `traces/`：标准化工具和测试证据；
- `runs/`：任务 context、边界和迭代文件；
- `loops/`：决策、缺失证据和收敛状态；
- `sidecar/latest.md`：最近一次验证摘要。

这些是运行时文件，不是源码。应按需要将 `.agent-context/` 加入本地 Git 排除，绝不要提交包含密钥的输出。

## 升级和旧版本清理

运行新 EXE 前必须关闭 OpenCode Desktop。安装器会替换插件、刷新 `agents/opencode-plusplus.md`、保留有效的 enabled 状态，并清理旧版本创建的：

- `commands/opencode-plusplus-status.md`、`opencode-plusplus-on.md`、`opencode-plusplus-off.md`；
- `commands/plusplus-task.md` 和 `commands/plusplus-verify.md`；
- `skills/opencode-plusplus/SKILL.md`；
- 检测到的旧 OpenCode++ `app.asar` 补丁及其备份。

升级后重启 OpenCode 并重新选择模式。如果看不到模式，先检查实际生效的配置目录，以及是否存在覆盖 OpenCode 配置根目录的其他配置文件。

## 边界

- 插件观察 OpenCode 的工具 hook，不是操作系统级沙箱；
- 无法阻止其他进程修改文件；
- 命令成功不等于业务语义正确；
- manual、stale 或 superseded evidence 在当前 policy 下仍可能阻塞；
- 不会自动 commit、push、merge 或破坏性回滚仓库。

## 定制插件

如果需要不同 Harness，可以 fork 仓库或添加项目级 agent。可以定制 agent Prompt、retrieval 排序、命令 Guard、evidence policy 和 loop 决策逻辑；修改后补测试并重新构建 Windows 安装器。详见 [Windows 插件架构](../concepts/windows-plugin-architecture.zh-CN.md) 和[定制说明](../../README.zh-CN.md#定制自己的-harness)。

CLI 和 MCP 文档只面向开发者和兼容集成。
