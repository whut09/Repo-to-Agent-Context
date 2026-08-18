# Release Checklist

[中文](release.zh-CN.md) | English

OpenCode++ publishes two runtime deliverables:

- the npm package for CLI, MCP, Harness, and shared runtime code;
- the Windows EXE for the user-level official OpenCode Desktop plugin and its marker-checked native command patch.

Benchmark fixtures, agent runs, repository documentation, local runtime artifacts, and stale build output must not enter the npm package.

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
npm run build
npm run release:verify
npm run build:installer:windows
```

## npm Package

The root package.json version is the single version source. package-info:generate creates runtime constants used by CLI, MCP, freshness, and the plugin bundle.

Confirm that npm pack contains dist, README files, config examples, package metadata, and LICENSE. It must not contain node_modules, benchmark fixtures, agent-runs, local cache, .agent-context, release EXEs, or stale Desktop/TUI output.

## Windows EXE

Build on Windows with Node.js 20+ and .NET Framework 4.x build tools. esbuild minifies the plugin, gzip compresses it, and the Windows C# compiler embeds it in the installer. The release must include:

- opencode-plusplus-setup-win-x64.exe;
- opencode-plusplus-setup-win-x64.exe.sha256;
- release notes that state the supported architecture, per-user install boundary, restart requirement, and unsigned SmartScreen behavior.

Smoke test with an isolated --config-dir:

1. install and inspect status JSON;
2. verify the plugin, three native command menu files, and the host patch exist;
3. disable and confirm enabled=false;
4. enable and confirm enabled=true;
5. load or syntax-check the installed plugin;
6. uninstall and confirm only owned files are removed.
7. run `npm run test:installer:windows` and enforce the 12 MiB installer size budget;
8. on a supported Desktop install, verify the patched `app.asar` is readable and uninstall restores the original bundle.

## Publish Verification

After publishing, verify npm version, GitHub tag, Release assets, EXE digest, asset size, and origin/main commit. A clean checkout must reproduce both npm package checks and the installer build without relying on local dist or release files.
