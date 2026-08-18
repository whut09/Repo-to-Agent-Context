# Roadmap

[中文](roadmap.zh-CN.md) | English

OpenCode++ is now Windows-first. The primary product is a user-level plugin for the official OpenCode Desktop application, distributed as a double-click EXE. CLI, MCP, and the Harness remain advanced automation surfaces.

## Shipped in v0.2.0

- self-contained Windows EXE built with Node SEA and postject;
- per-user install into the active OpenCode configuration directory;
- status, enable, and disable through model-visible OpenCode tools, plus model-free EXE controls;
- command/path Guard before tool execution;
- redacted evidence and working-tree hashes after tool execution;
- idle incremental verification and repository sidecar reports;
- deterministic evidence supersede, decision arbitration, convergence/no-progress detection, resumable phases, and atomic artifact storage;
- Windows and Ubuntu CI coverage;
- npm package separation from Desktop/benchmark/runtime artifacts;
- removal of the old Electron Desktop MVP and TUI shell.

## Windows Priorities

### P0: Distribution Trust

- Authenticode/code-sign the Windows EXE.
- Publish an SBOM, SHA256, build provenance, and reproducible release instructions.
- Validate the installer from a clean Windows checkout and an unprivileged account.
- Keep uninstall ownership strict so user files and other plugins are never removed.

### P1: Upgrade Experience

- Detect a running OpenCode Desktop process and explain that a restart is required.
- Show installed version, target config directory, and enabled state before overwrite.
- Add explicit upgrade/repair modes and preserve valid state revisions.
- Evaluate a smaller bootstrap installer while keeping offline/self-contained installation available.

### P1: Desktop Compatibility

- Test against supported OpenCode Desktop versions and record the plugin API version.
- Add real Desktop smoke tests for tool registration, hook input normalization, command controls, and idle verification.
- Track OpenCode plugin API changes without patching Desktop binaries.
- Add a native settings panel only if OpenCode exposes a stable third-party extension point.

### P2: Windows Operations

- Improve custom OPENCODE_CONFIG_DIR/XDG_CONFIG_HOME discovery diagnostics.
- Add clearer Windows Event Log or local diagnostic output without storing secrets.
- Add install/upgrade/uninstall integration tests for paths with spaces and non-ASCII characters.
- Evaluate ARM64 packaging after the x64 path is stable.

## Harness Priorities

- native event normalizers for Codex CLI, Claude Code, and MiMoCode;
- richer real-agent benchmark baselines and nightly runs;
- higher retrieval Precision@8 and regression recall;
- stronger contract/evidence defaults for high-reliability workflows;
- better recovery diagnostics for interrupted phases and revision conflicts.

## Boundaries That Will Not Change

- OpenCode++ will not become a second OpenCode Desktop shell.
- It will not patch OpenCode binaries, renderer code, updater, or authentication.
- It will not claim that command success proves semantic correctness.
- It will not silently commit, push, merge, or destructively reset a user's worktree.
- Desktop plugin controls remain available when protection is disabled.

## Release Gates

Every release must pass typecheck, lint, format, generated CLI docs, unit/integration tests, deterministic benchmarks, build, npm pack verification, Windows installer build, SHA256 generation, and an isolated install/enable/disable/uninstall smoke test.
