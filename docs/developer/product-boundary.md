# Product Boundary

[中文](product-boundary.zh-CN.md) | English

OpenCode++ has exactly one runtime product: **the Windows plugin for the official OpenCode Desktop**. The entire user journey is: download `opencode-plusplus-setup-win-x64.exe`, double-click to install, restart OpenCode Desktop. There is no `npm install` path for end users and no alternative UI runtime.

## Single Production Runtime Entry

- `src/integrations/opencode/global-plugin.ts` is the only production runtime entry for the plugin.
- At build time esbuild bundles it into a self-contained CommonJS bundle (`build:installer:windows`), gzip-compresses it, and embeds it as the EXE resource `OpenCodePlusPlus.Plugin.gz`.
- The bundle loads standalone outside this repository, does not depend on `node_modules`, and does not depend on an absolute repository path. At runtime it uses Node.js built-in modules only.
- Existing plugin tool names remain compatible; `opencode_plusplus_dashboard` is the additional visible Harness status tool.
- The installer writes one standard `mode: primary` agent at `agents/opencode-plusplus.md`; the mode prompt invokes the in-process Harness tools through the current OpenCode model.
- The installer removes the three old native command files, the two old workflow commands, the old skill, and a detected legacy `app.asar` patch. New releases do not patch the Desktop bundle.

## Degraded to Internal Dev/Test Surfaces

The following remain in the repository and the npm developer package but are **no longer a user installation or usage path**:

| Module     | bin / entry             | Role                                                                                                                                               |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/` | `opencode-plusplus`     | CI, repository context generation, diagnostics, harness-led batch runs; also the internal CLI entry used by plugin-runtime tests (`cli-runner.ts`) |
| `src/mcp/` | `opencode-plusplus-mcp` | development and compatibility surface for external agent hosts that speak MCP                                                                      |

- Both share the Guard, Evidence, Policy, Decision, and Loop Engineering implementations in `src/harness/` and `src/core/`.
- The npm package continues to ship `dist/cli` and `dist/mcp` purely as development dependencies and CI tooling so legacy CLI/MCP invocations do not break the plugin build. Desktop users never install the npm package.
- Decision: do not split packages for now. Splitting would change CI, the `docs:cli` snapshot, and existing integration install flows, while the current requirement only asks that they stop being a user path. Keeping them as development dependencies is the most compatible option.

## Kept (Harness core, now in-plugin modules)

- `src/harness/`: all control-plane, verification-plane, and evidence core logic is retained.
- `src/integrations/opencode/plugin-runtime/harness/`: `prepare`, `retrieve`, `evaluate`, and `next` reuse that core as in-process plugin tools and **never spawn the CLI**.
- `src/core/`, `src/analyzers/`, `src/outputs/`: indexing, analysis, and artifact output, inlined directly into the plugin bundle.
- `src/installer/`: the Windows installer, primary agent prompt, and EXE build path.

## Removed and Confirmed Absent

- No alternative Desktop source tree is present. The `apps/desktop/` forbidden prefix remains only as a release guard against stale generated output.
- Release artifacts do not contain a Node.js or Electron runtime, the OpenCode runtime, or the source checkout.

## Release Package Boundary

- **EXE (user release)**: embeds exactly one resource, the plugin bundle; `test/release-boundary.test.ts` statically verifies the installer resource manifest.
- **npm package (developer release)**: the `files` whitelist contains only `dist/**/*.js`, README files, config examples, and `.env.example`; `release/`, `.installer-build/`, `node_modules/`, `.agent-context/`, `apps/desktop/`, and `docs/` are forbidden. `scripts/verify-release.mjs` requires the plugin entry `dist/integrations/opencode/global-plugin.js`.

## Guard Tests

- `test/plugin-bundle.test.ts`: bundle loads standalone, single function export, no repository path, no node_modules requires, eight tool names registered, build independent of CLI/MCP modules.
- `test/release-boundary.test.ts`: installer embeds only plugin + patch, build script bundles only `global-plugin.ts`, `global-plugin.ts` imports only plugin-runtime, and the npm files whitelist excludes release/build artifacts.
- `test/installer-prompt-sync.test.ts`: the C# EXE installer constants and file names stay byte-identical to the TS prompt source, so a passing TS test cannot hide a missing EXE write.
- `test/windows-installer.test.ts` and `scripts/smoke-windows-installer.mjs`: the installer writes the primary mode, removes legacy command files, loads the plugin, and uninstall removes owned files.
- `test/plugin-harness-tools.test.ts` and `test/opencode-plugin-runtime.test.ts`: Desktop plugin tool registration and hook behavior stay compatible.
