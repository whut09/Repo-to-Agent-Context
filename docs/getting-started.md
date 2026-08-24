# Getting Started

[中文](getting-started.zh-CN.md) | English

OpenCode++ is for coding sessions where a plausible answer is not enough. It makes the selected OpenCode model gather repository context, stay inside explicit edit boundaries, produce current evidence, and explain why a task can or cannot be finalized.

## Five Minutes

1. Download the Windows EXE from [Releases](https://github.com/whut09/opencode-plusplus/releases).
2. Exit OpenCode Desktop, double-click the EXE, and restart OpenCode.
3. Open a repository and select **OpenCode++** in the mode picker.
4. Describe a coding task normally.
5. Review `.agent-context/` when you need the evidence or decision report.

![OpenCode++ mode](images/opencode-plusplus-mode.png)

## What Happens

The mode prompt steers the current model through `retrieve` and `prepare` before edits, built-in shell execution for required commands, and `evaluate` plus `next` after edits. If a check is stale, missing, forbidden, or repeated without progress, the Harness reports the reason instead of silently claiming success.

## When To Customize

Use the default mode first. Fork or extend the plugin when your repository needs different protected paths, test trust, retrieval weighting, evidence policy, or loop stopping rules. Add a test for the new rule and keep the Windows installer and bilingual docs synchronized.

CLI and MCP are developer/compatibility surfaces. They are not needed for this installation path.
