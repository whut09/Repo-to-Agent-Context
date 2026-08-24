# Release Checklist

[中文](release.zh-CN.md) | English

OpenCode++ ships one product deliverable and one developer deliverable:

- the Windows EXE is the product release: the user-level official OpenCode Desktop plugin and its marker-checked native command patch;
- the npm package is a developer artifact that carries the CLI, MCP, Harness, and shared runtime code as development/CI tooling. Desktop users never install it.

Benchmark fixtures, agent runs, repository documentation, local runtime artifacts, and stale build output must not enter the npm package. The npm package must also exclude `release/`, `.installer-build/`, and `apps/desktop/`.

## Full Gate

```powershell
npm run check
npm run lint
npm run format:check
npm run docs:cli:check
npm run docs:bilingual:check
npm test
npm run benchmark
npm run benchmark:agent
npm run benchmark:desktop
npm run build
npm run build:installer:windows
npm run test:installer:windows
npm run release:verify
```

## npm Package

The root package.json version is the single version source. package-info:generate creates runtime constants used by CLI, MCP, freshness, and the plugin bundle.

Confirm that npm pack contains dist, README files, config examples, package metadata, and LICENSE, including the plugin entry `dist/integrations/opencode/global-plugin.js`. It must not contain node_modules, benchmark fixtures, agent-runs, local cache, .agent-context, release EXEs, `.installer-build/`, or stale UI build output.

## Windows EXE

Build on Windows with Node.js 20+ and .NET Framework 4.x build tools. esbuild minifies the plugin, gzip compresses it, and the Windows C# compiler embeds it in the installer. The release must include:

- opencode-plusplus-setup-win-x64.exe;
- opencode-plusplus-setup-win-x64.exe.sha256;
- opencode-plusplus-release.json;
- release notes that state the supported architecture, per-user install boundary, restart requirement, and unsigned SmartScreen behavior.

Smoke test with an isolated --config-dir:

1. install and inspect status JSON;
2. verify the plugin, three native command menu files, and the host patch exist;
3. disable and confirm enabled=false;
4. enable and confirm enabled=true;
5. load or syntax-check the installed plugin;
6. uninstall and confirm only owned files are removed;
7. run `npm run test:installer:windows` and enforce the 12 MiB installer size budget;
8. run `npm run release:verify` to verify the EXE, SHA256, release manifest, standalone plugin load, three command names, patch marker, original backup, rollback, and uninstall restoration;
9. run `npm run benchmark:desktop`; it is a deterministic in-process plugin benchmark with zero paid model calls;
10. use the manual `Desktop smoke` workflow on a self-hosted Windows runner labeled `opencode-desktop` to run `npm run test:desktop:real` against an installed OpenCode Desktop executable.

PR CI runs on Ubuntu and Windows. It never runs a paid executor. Linux verifies the npm developer package and deterministic proxy benchmarks; Windows builds the EXE, runs the installer/recovery gate, and runs the deterministic Desktop plugin benchmark. Real Desktop launch is manual only because hosted runners do not contain the official GUI application.

## Publish Verification

After publishing, verify npm version, GitHub tag, Release assets, EXE digest, asset size, manifest version, and origin/main commit. A clean checkout must reproduce both npm package checks and the installer build without relying on local dist or release files. The root `package.json` remains the single version source; generated package info and the Desktop release manifest must match it.
