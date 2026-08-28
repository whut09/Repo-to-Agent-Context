# MCP 排障

[English](mcp-troubleshooting.md) | 中文

## 工具没有出现

确认 MCP client 启动的是 opencode-plusplus-mcp，配置路径指向正确的 Node/npm 环境，并重新启动 client。MCP 与 OpenCode Desktop 插件是两条入口，MCP 正常不代表 Desktop 插件已安装。本页只适用于开发者或兼容集成，不负责安装或启用 Desktop 插件。普通 Desktop 使用请安装 Windows EXE、重启 OpenCode，然后选择 `OpenCode++` primary mode。

## Windows 路径

路径包含空格或中文时使用绝对路径和 JSON 正确转义，不要把路径拼进 shell 字符串。确认仓库目录可读写，node_modules 已安装，Node.js 为 20+。

## 证据或 policy 阻塞

查看 trace、working-tree hash、evidencePolicy、missingEvidence 和 requiredCommands。balanced/strict 下 manual-only evidence 可能不能关闭源代码修改后的 blocking requirement；先用 trace run 捕获命令。

## Desktop 与 MCP 的区别

Desktop 插件写用户配置目录并由 OpenCode 加载；MCP server 是 stdio 进程。Desktop 工具不可见时检查 EXE --status --json、重启 OpenCode 和旧 .opencode/plugins 文件。
