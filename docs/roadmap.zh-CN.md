# 路线图

[English](roadmap.md) | 中文

OpenCode++ 当前以 Windows 为重点。主要产品是官方 OpenCode Desktop 的用户级插件，通过可双击 EXE 分发；CLI、MCP 和 Harness 继续作为高级自动化入口。

## v0.2.0 已交付

- Node SEA + postject 构建的自包含 Windows EXE；
- 安装到当前用户实际使用的 OpenCode 配置目录；
- 通过 OpenCode 模型可见工具查看状态、启用和关闭，并提供无需模型的 EXE 控制；
- 工具执行前的命令/路径 Guard；
- 工具执行后的脱敏 evidence 和 working-tree hash；
- idle 增量验证和仓库 Sidecar 报告；
- 确定性 evidence supersede、decision 仲裁、no-progress 收敛、可恢复阶段和原子 artifact；
- Windows/Ubuntu CI；
- npm 包与 Desktop、benchmark、runtime artifact 分离；
- 删除旧 Electron Desktop MVP 和 TUI 外壳。

## Windows 优先级

### P0：分发可信度

- 对 Windows EXE 做 Authenticode/代码签名；
- 发布 SBOM、SHA256、构建 provenance 和可复现发布说明；
- 在清洁 Windows checkout 和非管理员账户验证安装器；
- 严格限制卸载所有权，绝不删除用户文件和其他插件。

### P1：升级体验

- 检测运行中的 OpenCode Desktop，并明确提示必须重启；
- 覆盖前显示已安装版本、目标配置目录和启用状态；
- 增加明确的 upgrade/repair 模式并保留有效 state revision；
- 评估更小的 bootstrap installer，同时保留离线自包含安装方式。

### P1：Desktop 兼容性

- 对支持的 OpenCode Desktop 版本做兼容测试并记录插件 API 版本；
- 增加真实 Desktop smoke test，覆盖工具注册、hook input、控制命令和 idle verify；
- 跟踪 OpenCode 插件 API 变化，但不 patch Desktop 二进制；
- 只有 OpenCode 提供稳定第三方扩展点后，才考虑原生设置面板。

### P2：Windows 运维

- 改进 OPENCODE_CONFIG_DIR/XDG_CONFIG_HOME 自定义目录诊断；
- 增加不保存密钥的本地诊断或 Windows Event Log；
- 覆盖空格和非 ASCII 路径的安装/升级/卸载；
- x64 稳定后评估 ARM64。

## Harness 优先级

- Codex CLI、Claude Code、MiMoCode 原生 event normalizer；
- 更可靠的真实 Agent benchmark baseline 和 nightly；
- 提高 retrieval Precision@8 和 regression recall；
- 高可靠工作流使用更严格的 contract/evidence 默认策略；
- 改进阶段中断和 revision conflict 的恢复诊断。

## 不会改变的边界

- 不做第二个 OpenCode Desktop 外壳；
- 不 patch OpenCode binary、renderer、updater 或认证；
- 不声称命令成功就等于语义正确；
- 不静默 commit、push、merge 或 destructive reset 用户工作树；
- 保护关闭后，Desktop 控制工具仍然可用。

## 发布门禁

每次发布必须通过 typecheck、lint、format、CLI 生成文档、单元/集成测试、确定性 benchmark、build、npm pack 验证、Windows installer 构建、SHA256 和隔离目录安装/启用/关闭/卸载 smoke test。
