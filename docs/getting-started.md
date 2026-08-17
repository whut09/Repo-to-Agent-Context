# Getting Started

## Official OpenCode Desktop

For normal interactive use on Windows:

1. Install the official OpenCode Desktop application.
2. Download and double-click `opencode-plusplus-setup-win-x64.exe` from GitHub Releases.
3. Restart OpenCode Desktop.
4. Open a repository and use `opencode_plusplus_status` or `/opencode-plusplus-status` in chat.

The detailed setup guide is [OpenCode Desktop installation and usage](integrations/opencode-desktop.zh-CN.md).

## Advanced CLI

The CLI remains available for repository context generation, diagnostics, CI, and batch Harness runs:

```powershell
npm install --global opencode-plusplus
opencode-plusplus build .
opencode-plusplus status .
opencode-plusplus oc run "fix login timeout bug" . --max-loops 3
opencode-plusplus oc report --last
```

Use focused verification after edits:

```powershell
opencode-plusplus tests . --diff --base main
opencode-plusplus impact . --base main
opencode-plusplus verify --diff .
opencode-plusplus policy . --base main --fail-on required
```

## Local Development

```powershell
npm ci
npm run check
npm run build
npm test
```

Generated runtime files are written to `.agent-context/`. Use `opencode-plusplus run "task" .` when you want a task pack and trace without executing an external agent.
