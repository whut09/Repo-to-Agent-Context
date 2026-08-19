# Windows 官方 OpenCode Desktop 安装与使用

[English](opencode-desktop.md) | 中文

OpenCode++ 通过官方 OpenCode Desktop 的用户级插件目录和一个范围严格受限的宿主补丁接入。补丁只在内置 `SessionPrompt.command` 分发器中拦截三个 OpenCode++ 命令名，不修改 renderer、更新器、账户系统、认证逻辑或其他应用逻辑。

这个 EXE 是 OpenCode++ 唯一面向用户的安装与使用路径。CLI（`opencode-plusplus`）和 MCP 服务（`opencode-plusplus-mcp`）保留在仓库中作为内部 dev/test 兼容面，不出现在安装器 payload 里。完整边界划分见 [产品边界说明](../developer/product-boundary.zh-CN.md)。

## 安装

1. 完全退出 OpenCode Desktop。
2. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
3. 双击 EXE，不需要管理员权限。
4. 重新打开 OpenCode Desktop，打开一个仓库。
5. 新建会话，输入 `/plusplus-task <task>` 即可让 Harness 接管编码任务。

安装器写入：

```text
<OpenCode 配置目录>\plugins\opencode-plusplus.js
<OpenCode 配置目录>\opencode-plusplus\state.json
<OpenCode 配置目录>\opencode-plusplus\installation.json
<OpenCode 配置目录>\commands\opencode-plusplus-on.md
<OpenCode 配置目录>\commands\opencode-plusplus-off.md
<OpenCode 配置目录>\commands\opencode-plusplus-status.md
<OpenCode 配置目录>\commands\plusplus-task.md
<OpenCode 配置目录>\commands\plusplus-verify.md
<OpenCode 配置目录>\skills\opencode-plusplus\SKILL.md
```

默认配置目录是 `%USERPROFILE%\.config\opencode`。运行时优先使用 `OPENCODE_CONFIG_DIR`，也支持 `XDG_CONFIG_HOME`。隔离测试安装可以传 `--config-dir <path>`。

## Harness 工作流

重启后，会话提供 `/plusplus-task` 和 `/plusplus-verify` 两个普通模型 Slash Command，以及 OpenCode 在具体编码任务时自动加载的 `opencode-plusplus` skill，全程无需命令行：

- `/plusplus-task <task>` 按 Harness 顺序执行：`opencode_plusplus_prepare` → 读取 `mustInspect` 文件 → 只在 `allowedEditGlobs` 内修改 → 用内置 shell 工具跑 `requiredCommands` → `opencode_plusplus_evaluate` → `opencode_plusplus_next`。`nextAction` 不是 `finalize` 前不得声称完成。
- `/plusplus-verify` 重新执行 `opencode_plusplus_evaluate` 和 `opencode_plusplus_next`，并汇报阻塞状态、缺失证据和仍必须运行的命令。
- skill 负责在正确的时机引导模型调用正确工具，并把 blocking 视为未完成。

## 状态与开关

| 操作     | Desktop 工具（经过模型）    | 本地直接执行的 EXE 命令                         |
| -------- | --------------------------- | ----------------------------------------------- |
| 查看状态 | `opencode_plusplus_status`  | `opencode-plusplus-setup-win-x64.exe --status`  |
| 启用     | `opencode_plusplus_enable`  | `opencode-plusplus-setup-win-x64.exe --enable`  |
| 禁用     | `opencode_plusplus_disable` | `opencode-plusplus-setup-win-x64.exe --disable` |

OpenCode 的 Markdown Command 默认是 Prompt Template，但安装器会为这三个精确命令名注入宿主分发器拦截逻辑。补丁有效时，`/opencode-plusplus-status`、`/opencode-plusplus-on` 和 `/opencode-plusplus-off` 会在模板展开前被拦截，直接读取或更新本地 state 文件，并向当前会话写入本地结果；不会调用模型，也不会执行 Shell。其他 Markdown Command 仍保持 OpenCode 的默认行为。

禁用是暂停，不是卸载。插件仍保持加载，因此状态和重新启用仍可用。安装或升级后必须完全重启 OpenCode，让宿主重新加载插件模块。

## 补丁边界

- 安装器要求 Desktop bundle 中存在预期的 `SessionPrompt.command` 特征。
- 安装或卸载时必须完全退出 OpenCode，因为安装器会原子替换 `app.asar`。
- 原始文件会备份为 `app.asar.opencode-plusplus.original`，卸载时恢复。
- OpenCode 更新并替换 `app.asar` 后，原生命令会暂时消失；重新运行安装器即可重新检测、备份并补丁新版本。
- 如果 bundle 结构不支持或已变化，安装器会拒绝操作，不写入命令文件。
- 备份旁车文件记录 `schemaVersion`、补丁 marker、Desktop 版本、源 `app.asar` 和安装时间。卸载只恢复 OpenCode++ 自己创建且经过校验的未补丁备份。
- `--status` 会报告 `active`、`stale`、`absent` 或 `skipped`；OpenCode 更新替换 `app.asar` 后，已有安装会显示 `stale`，不会误报 active。
- 宿主替换和每次配置写入都使用临时文件及原子替换。补丁、plugin、command 或 state 任一步失败，宿主 bundle 仍可恢复，并且不会继续写入后续文件。
- `--host-asar` 仅供开发/冒烟测试覆盖路径使用；普通用户由安装器自动检测 OpenCode Desktop bundle。EXE 只包含 .NET 安装器、插件 bundle 和补丁资源，不携带 Node、Electron 或完整 OpenCode runtime。

## 插件做什么

启用时，插件会：

- 在工具执行前检查命令语法、已知 package script、危险 Shell 操作、受保护路径和疑似密钥路径；被拦下的命令返回固定双语结构（`BLOCKED: <原因>` / `Evidence: <命令或路径>` / `Do instead: <具体替代>`），让模型知道下一步改跑什么；不确定的路径参数记为 warning 而不是 blocker；
- 在工具执行后记录工具、命令、退出码、时间、变更路径、working-tree hash 以及脱敏/截断输出；
- 把 trace 和事件 artifact 写入当前仓库的 `.agent-context/`；
- 在文件编辑且会话进入 idle 后运行共享增量验证栈；
- 通过普通 OpenCode 插件工具提供状态、启用和禁用控制；
- 以 `opencode_plusplus_prepare`、`opencode_plusplus_retrieve`、`opencode_plusplus_evaluate`、`opencode_plusplus_next` 四个工具提供 `/plusplus-task` 和 `/plusplus-verify` 背后的会话内 Harness 工作流。

## 会话生命周期

插件会把 Harness 状态推回会话，而不是只写进 `.agent-context/` 文件：

- `session.created`：启用时把仓库标记为 dirty，并在 debounce（≥2 秒）后后台构建 context。成功时弹出 "OpenCode++ 已就绪" toast；构建失败只记录日志，绝不中断会话。
- `session.idle`：沿用现有 idle 验证。出现 blocker 时弹出一行 toast：`OpenCode++ 未通过：<第一条 blocker>。下一步调用 opencode_plusplus_next`。不会 throw。
- `experimental.session.compacting`：模型压缩长会话前，插件把当前 Harness 状态（taskId、allowed/avoid 编辑 glob、blocking、缺失证据、上次 decision、`.agent-context/sidecar/latest.md` 摘要）追加到 `output.context`，绝不替换 `output.prompt`。
- `session.error`：把错误记入 sidecar 事件日志作为证据，不打断宿主。

插件禁用时，除 `status`/`enable`/`disable` 工具外的生命周期处理全部立即返回。若当前 OpenCode 版本没有 toast API，通知会降级为结构化 `app.log` 记录，而不是假设不存在的 SDK 方法。

## 插件不能做什么

- 不能增加原生 OpenCode Desktop 设置页面；原生补丁只负责三个明确的 Slash Command。
- 不能给进程提供操作系统级沙箱，也不能控制其他应用做出的编辑。
- 不能仅凭命令退出码证明业务语义正确。
- 不能保证完全识别不透明的工具参数。
- 不会自动提交、推送、合并或破坏性回滚用户工作树。

## 升级

关闭 OpenCode Desktop 后运行新 EXE。安装器更新内置插件，检查或重新应用宿主补丁，写入三个原生命令菜单项以及 `/plusplus-task`、`/plusplus-verify` 命令和 `opencode-plusplus` skill，更新 `installation.json`，并保留现有有效启用状态。

如果旧项目集成留下 `.opencode/plugins/opencode-plusplus.ts`，安装全局插件后应删除该旧文件。两者同时存在可能导致 hook 重复加载。旧版仓库级命令 `.opencode/commands/opencode-plusplus.md` 和 `.opencode/commands/opencode-plusplus-verify.md` 会调用 CLI，已不再生成；可删除它们或重新运行 `opencode-plusplus opencode init .` 生成对齐的 `/plusplus-task` 和 `/plusplus-verify`。

## 卸载

```powershell
opencode-plusplus-setup-win-x64.exe --uninstall
```

卸载只删除安装器写入的文件，不删除仓库 `.agent-context/`、源代码、OpenCode Desktop 或其他插件。

## 排障

```powershell
opencode-plusplus-setup-win-x64.exe --status --json
opencode-plusplus-setup-win-x64.exe --disable --json
opencode-plusplus-setup-win-x64.exe --enable --json
opencode-plusplus-setup-win-x64.exe --config-dir "C:\Temp\opencode-config" --status --json
```

如果工具没有出现：

1. 完全退出并重启 OpenCode；
2. 确认插件文件位于 OpenCode 当前实际使用的配置目录；
3. 新建仓库会话；
4. 使用 EXE 的 `--status --json`；
5. 删除遗留的项目级插件；
6. 每次 OpenCode Desktop 更新后重新运行安装器。

## 从源码构建

Windows + Node.js 20+ 环境下执行：

```powershell
npm ci
npm run check
npm run build:installer:windows
```

输出为 `release/opencode-plusplus-setup-win-x64.exe` 和 SHA256 文件。构建流程压缩全局插件并嵌入小型 .NET Framework 安装器；EXE 不再携带 Node 或 Electron runtime，也不依赖源代码仓库。受支持的 Windows 10/11 已包含所需的 .NET Framework 4.x。发布二进制未做商业代码签名，遇到 SmartScreen 提示时应先核对 Release SHA256。
