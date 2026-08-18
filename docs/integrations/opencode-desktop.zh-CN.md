# Windows 官方 OpenCode Desktop 安装与使用

[English](opencode-desktop.md) | 中文

OpenCode++ 通过官方 OpenCode Desktop 的用户级插件目录和一个范围严格受限的宿主补丁接入。补丁只在内置 `SessionPrompt.command` 分发器中拦截三个 OpenCode++ 命令名，不修改 renderer、更新器、账户系统、认证逻辑或其他应用逻辑。

## 安装

1. 完全退出 OpenCode Desktop。
2. 从 [GitHub Releases](https://github.com/whut09/opencode-plusplus/releases) 下载 `opencode-plusplus-setup-win-x64.exe`。
3. 双击 EXE，不需要管理员权限。
4. 重新打开 OpenCode Desktop，打开一个仓库。
5. 新建会话，确认工具列表中存在 `opencode_plusplus_status`。

安装器写入：

```text
<OpenCode 配置目录>\plugins\opencode-plusplus.js
<OpenCode 配置目录>\opencode-plusplus\state.json
<OpenCode 配置目录>\opencode-plusplus\installation.json
<OpenCode 配置目录>\commands\opencode-plusplus-on.md
<OpenCode 配置目录>\commands\opencode-plusplus-off.md
<OpenCode 配置目录>\commands\opencode-plusplus-status.md
```

默认配置目录是 `%USERPROFILE%\.config\opencode`。运行时优先使用 `OPENCODE_CONFIG_DIR`，也支持 `XDG_CONFIG_HOME`。隔离测试安装可以传 `--config-dir <path>`。

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

## 插件做什么

启用时，插件会：

- 在工具执行前检查命令语法、已知 package script、危险 Shell 操作、受保护路径和疑似密钥路径；
- 在工具执行后记录工具、命令、退出码、时间、变更路径、working-tree hash 以及脱敏/截断输出；
- 把 trace 和事件 artifact 写入当前仓库的 `.agent-context/`；
- 在文件编辑且会话进入 idle 后运行共享增量验证栈；
- 通过普通 OpenCode 插件工具提供状态、启用和禁用控制。

## 插件不能做什么

- 不能增加原生 OpenCode Desktop 设置页面；原生补丁只负责三个明确的 Slash Command。
- 不能给进程提供操作系统级沙箱，也不能控制其他应用做出的编辑。
- 不能仅凭命令退出码证明业务语义正确。
- 不能保证完全识别不透明的工具参数。
- 不会自动提交、推送、合并或破坏性回滚用户工作树。

## 升级

关闭 OpenCode Desktop 后运行新 EXE。安装器更新内置插件，检查或重新应用宿主补丁，写入三个命令菜单项，更新 `installation.json`，并保留现有有效启用状态。

如果旧项目集成留下 `.opencode/plugins/opencode-plusplus.ts`，安装全局插件后应删除该旧文件。两者同时存在可能导致 hook 重复加载。

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
