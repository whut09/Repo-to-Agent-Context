# Release Checklist

OpenCode++ is split into two npm packages:

- `opencode-plusplus`: CLI and MCP runtime.
- `@opencode-plusplus/desktop`: Electron main process and bundled renderer.

Benchmark fixtures, benchmark agent runs, repository documentation, source assets, and Desktop files are not included in the core package.

The recommended install path is:

```bash
npm i -g opencode-plusplus opencode-ai
cd your-repo
opencode-plusplus
```

## Release Gate

Run the full gate before publishing a new version:

```bash
npm run check
npm run lint
npm run format:check
npm run docs:cli:check
npm test
npm run benchmark
npm run benchmark:agent
npm run build
npm run release:verify
```

CI already runs the same baseline. `prepublishOnly` first deletes both build directories, rebuilds the core and Desktop packages, then validates both `npm pack --json` manifests. This prevents a release from depending on stale local `dist` files.

The root `package.json` version is the single version source. `npm run package-info:generate` generates the runtime constants and synchronizes the Desktop workspace and lock-file package versions. CLI, MCP, freshness manifests, and generated OpenCode plugins all consume the generated runtime version.

## Manual Checks

- Confirm `package.json` has the intended package name and version.
- Confirm `README.md` and `README.en.md` use the npm install path.
- Run `npm run release:verify` and inspect the reported file counts and packed sizes.
- Confirm the core package does not contain `assets/`, `benchmarks/`, or `apps/desktop/`.
- Confirm the tarball does not include local dependency folders such as `node_modules/` or `apps/desktop/node_modules/`.
- Confirm the tarball does not include generated local caches such as `.agent-context/cache/`.
- Smoke test the packed tarball in a temporary directory before publishing when possible.
- After publishing, confirm the published version with `npm view opencode-plusplus version`.

## Publish Command

Publishing requires an npm account with permission to publish `opencode-plusplus`:

```bash
npm publish
npm publish --workspace @opencode-plusplus/desktop --access public
```

For packages that require two-factor authentication, use a one-time password or a granular access token with publish permission and 2FA bypass enabled.
