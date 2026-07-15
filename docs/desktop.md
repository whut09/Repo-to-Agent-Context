# OpenCode++ Desktop MVP

OpenCode++ Desktop is a lightweight Electron UI for running the existing OpenCode++ harness from a desktop window. It does not embed the OpenCode TUI.

The main motivation is practical: OpenCode's terminal TUI can be awkward for copy/paste-heavy workflows, especially on Windows. Pasting multiline tasks, issue descriptions, code snippets, quoted JSON, or long command plans into a terminal can break formatting or interact badly with terminal shortcuts and focus. The desktop app gives OpenCode++ a normal text area, log panel, stop button, and report opener while keeping OpenCode as the actual executor.

## Why Not Embed The OpenCode TUI

OpenCode is already a terminal-native coding agent runtime. Embedding its TUI inside Electron would add a second terminal layer, which makes the exact copy/paste problem worse: clipboard handling, keyboard shortcuts, shell behavior, focus, and platform-specific terminal emulation all become harder to make reliable.

The Desktop MVP avoids that problem:

```txt
Desktop UI
  -> child_process
  -> local dist CLI or OPENCODE_PLUSPLUS_BIN
  -> opencode-plusplus oc run --repo "<repo>" --max-loops 2 --stream-executor -- "<task>"
  -> stdout/stderr stream
  -> generated report
```

OpenCode++ remains the harness. The desktop app only gives users a visual control surface for selecting a repository, entering a task, starting or stopping the run, watching output, and opening the generated report.

## What It Does

- Select a local repository directory.
- Enter a task in a desktop form.
- Run the local built CLI when available, or `OPENCODE_PLUSPLUS_BIN` when explicitly configured.
- Pass `oc run --repo "<repo>" --max-loops 2 --stream-executor -- "<task>"` to the CLI.
- Use a Desktop-specific OpenCode executor command with `--pure --print-logs --log-level INFO --format json` so OpenCode logs are visible in the desktop output panel.
- Stream stdout and stderr in real time.
- Show a running heartbeat when the harness or OpenCode is still alive but has not emitted output yet.
- Stop stalled executor runs when OpenCode produces no real output for the configured idle timeout.
- Stop the current task.
- Open the latest `.agent-context/orchestrator/<task-id>/orchestrator.md` report.

## What It Does Not Do

- It does not embed OpenCode's TUI.
- It does not replace OpenCode.
- It does not modify guard, policy, trace, impact, or orchestrator logic.
- It does not implement a separate agent runtime.

## Project Layout

```txt
apps/desktop/
  package.json
  src/main/main.ts        Electron main process and child_process runner
  src/main/preload.cts    Safe IPC bridge
  src/renderer/src/       React UI
```

## Development

| Mode                    | Status                        | Commands / notes                                                                                                                    |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Development mode        | Supported                     | From the repo root, run `npm ci`, `npm run build`, and `npm link`. Then run `npm run start --workspace @opencode-plusplus/desktop`. |
| Packaged installer mode | Not provided yet              | Planned for a later `electron-builder` or `electron-forge` setup.                                                                   |
| CLI dependency          | Required for development mode | Development mode depends on the root CLI build/link step before starting the Electron shell.                                        |

Desktop is an npm workspace. Install root and Desktop dependencies with the single root lock file:

```bash
npm ci
```

Check and build every workspace from the repository root:

```bash
npm run check
npm run build
```

Run only the Desktop checks or build:

```bash
npm run check:desktop
npm run build:desktop
```

Run the built shell:

```bash
npm run start --workspace @opencode-plusplus/desktop
```

During source development, build the root CLI before starting the desktop app:

```bash
npm run build && npm link
npm run start --workspace @opencode-plusplus/desktop
```

CI typechecks and builds the Electron main process and renderer on both Ubuntu and Windows without starting a GUI. Electron downloads use the `ELECTRON_CACHE` directory cached by GitHub Actions so transient binary download failures can reuse a previously downloaded archive.

The desktop app first looks for the repository root from its compiled main process and runs the local `dist/cli/index.js` with Node. Set `OPENCODE_PLUSPLUS_BIN` only when you intentionally want Desktop to use a different installed CLI.
