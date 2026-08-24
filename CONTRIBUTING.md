# Contributing

OpenCode++ is a Windows-first OpenCode Desktop plugin. Contributions should improve the plugin, Harness behavior, installer safety, tests, or documentation without turning the project into a second Desktop application.

## Workflow

1. Fork the repository and create a focused branch.
2. Read `AGENTS.md` and the source files in the change boundary.
3. Add deterministic tests for behavior changes.
4. Keep user-facing documentation in English and Chinese in sync.
5. Run the relevant checks before opening a pull request.

## Desktop Changes

The user path is the Windows EXE followed by selecting the **OpenCode++** mode in OpenCode Desktop. Do not add Slash Commands, modify `app.asar`, or introduce a second UI as a shortcut. Installer changes must preserve existing user config, remove legacy files safely, and keep plugin hooks non-fatal to OpenCode.

On Windows, run:

```powershell
npm run check
npm run lint
npm run format:check
npm run docs:bilingual:check
npm test
npm run build:installer:windows
npm run test:installer:windows
npm run release:verify
```

Do not commit `dist/`, `release/`, `.installer-build/`, `node_modules/`, `.agent-context/`, benchmark results, secrets, or local OpenCode configuration.
