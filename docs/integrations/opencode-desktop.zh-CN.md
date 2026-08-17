# 在官方 OpenCode Desktop 中使用 OpenCode++

OpenCode++ 现在以官方 OpenCode 插件形式集成到 Desktop。仓库不修改 OpenCode Desktop 的安装目录或更新器，也不再提供单独的桌面外壳。

## 安装

1. 从 GitHub Release 下载 `opencode-plusplus-setup-win-x64.exe`。
2. 双击运行安装器，等待出现安装完成提示。
3. 完全退出并重新打开 OpenCode Desktop。
4. 在 Desktop 中打开需要使用 OpenCode++ 的仓库，创建或重新加载聊天会话。

安装器只写入当前 Windows 用户目录，不需要管理员权限：

```text
%USERPROFILE%\.config\opencode\plugins\opencode-plusplus.js
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-on.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-off.md
%USERPROFILE%\.config\opencode\commands\opencode-plusplus-status.md
%USERPROFILE%\.config\opencode\opencode-plusplus\state.json
```

如果 OpenCode 使用了自定义配置目录，安装器会使用 `OPENCODE_CONFIG_DIR`；也可以用安装器的 `--config-dir` 参数指定目录。

## 在 Desktop 中使用

安装并重启后，OpenCode++ 会作为全局插件加载。日常操作全部在 OpenCode Desktop 界面内完成：

- `opencode_plusplus_status`：查看安装版本、启用状态和状态文件位置。
- `opencode_plusplus_enable`：启用命令 Guard、工具证据和空闲验证。
- `opencode_plusplus_disable`：暂停 Guard、工具证据和空闲验证；状态工具仍然可用。

也可以在聊天输入框中使用这些命令：

```text
/opencode-plusplus-status
/opencode-plusplus-on
/opencode-plusplus-off
```

这些命令由 OpenCode 调用对应插件工具，不会打开终端。开关状态保存到用户配置目录，重启 Desktop 后仍然保留。

## 运行效果

启用后，插件会在当前仓库中：

- 在工具执行前阻止危险命令、未知脚本和受保护路径；
- 在工具执行后记录退出码、输出摘要、调用会话和 working-tree hash；
- 在编辑后进入空闲状态时运行增量验证；
- 将 Sidecar 报告和 Harness artifact 写入仓库的 `.agent-context/`。

OpenCode++ 不提供单独的 Desktop 设置页。当前 OpenCode 插件 API 没有公开第三方设置面板扩展点，因此控制入口放在 OpenCode 自己支持的插件工具和 slash command 中。这些入口在官方 Desktop 中可见并可操作。

## 验证安装

最直接的验证方式是在 Desktop 新建会话并输入：

```text
调用 opencode_plusplus_status，返回 OpenCode++ 当前状态。
```

预期结果包含 `Enabled: yes` 和当前版本。然后可以输入 `/opencode-plusplus-off`，再次调用状态工具确认变为 `Enabled: no`，最后输入 `/opencode-plusplus-on` 恢复。

## 安装器命令行选项

双击是推荐方式。排障或自动化时，可在 PowerShell 中使用同一个 EXE：

```powershell
opencode-plusplus-setup-win-x64.exe --status --json
opencode-plusplus-setup-win-x64.exe --disable --json
opencode-plusplus-setup-win-x64.exe --enable --json
opencode-plusplus-setup-win-x64.exe --uninstall --json
```

卸载只删除 OpenCode++ 自己写入的插件、slash command 和状态文件，不删除仓库的 `.agent-context/`，也不影响 OpenCode Desktop 本身。

## 从源码构建安装器

仓库维护者可以在 Windows、Node.js 20+ 环境中构建：

```powershell
npm ci
npm run check
npm run build:installer:windows
```

输出文件为 `release/opencode-plusplus-setup-win-x64.exe` 及对应的 `.sha256` 文件。构建使用 Node SEA 和 `postject`，插件代码会嵌入安装器，不依赖本机仓库路径。

## 常见问题

### Desktop 没有看到工具

完全退出 OpenCode Desktop 后重新启动。确认插件文件存在：

```powershell
Test-Path "$env:USERPROFILE\.config\opencode\plugins\opencode-plusplus.js"
```

如果配置目录不是默认位置，检查 `OPENCODE_CONFIG_DIR`，然后重新运行安装器。

### 旧项目插件导致重复执行

升级前曾运行过项目初始化命令的仓库，可能存在 `.opencode/plugins/opencode-plusplus.ts`。全局插件安装后应删除这个旧项目入口，再重新打开仓库，避免同一工具 hook 被加载两次。

### 如何只临时关闭

在 Desktop 聊天中调用 `opencode_plusplus_disable` 或 `/opencode-plusplus-off`。这不会卸载插件，之后可以用 `opencode_plusplus_enable` 恢复。
