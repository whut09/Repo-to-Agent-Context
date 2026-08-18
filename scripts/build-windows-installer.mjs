import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.join(root, ".installer-build");
const release = path.join(root, "release");
const pluginPath = path.join(staging, "opencode-plusplus-plugin.cjs");
const installerEntry = path.join(staging, "installer-entry.cjs");
const installerBundle = path.join(staging, "installer.cjs");
const seaConfig = path.join(staging, "sea-config.json");
const seaBlob = path.join(staging, "sea-prep.blob");
const executable = path.join(release, "opencode-plusplus-setup-win-x64.exe");

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(release, { recursive: true });

await build({
  stdin: {
    contents:
      'import { OpenCodePlusPlusGlobalPlugin } from "./src/integrations/opencode/global-plugin.ts";\n' + "module.exports = OpenCodePlusPlusGlobalPlugin;\n",
    resolveDir: root,
    sourcefile: "opencode-plusplus-plugin-entry.ts",
    loader: "ts"
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: pluginPath,
  legalComments: "none"
});

const pluginModule = await import(`${pathToFileURL(pluginPath).href}?build=${Date.now()}`);
const pluginExports = [...new Set(Object.values(pluginModule))];
if (pluginExports.length !== 1 || typeof pluginExports[0] !== "function") {
  throw new Error("Bundled plugin must expose exactly one OpenCode plugin function.");
}

const pluginGzipBase64 = gzipSync(readFileSync(pluginPath)).toString("base64");
writeFileSync(
  installerEntry,
  `const { runWindowsInstaller } = require(${JSON.stringify(path.join(root, "src/installer/windows-installer.ts"))});\n` +
    `runWindowsInstaller(process.argv.slice(1), { pluginGzipBase64: ${JSON.stringify(pluginGzipBase64)} });\n`,
  "utf8"
);

await build({
  entryPoints: [installerEntry],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: installerBundle,
  legalComments: "none"
});

writeFileSync(
  seaConfig,
  JSON.stringify({ main: installerBundle, output: seaBlob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2),
  "utf8"
);
run(process.execPath, ["--experimental-sea-config", seaConfig]);
copyFileSync(process.execPath, executable);
run(process.execPath, [
  path.join(root, "node_modules/postject/dist/cli.js"),
  executable,
  "NODE_SEA_BLOB",
  seaBlob,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
]);

const checksum = spawnSync("certutil.exe", ["-hashfile", executable, "SHA256"], { encoding: "utf8" });
const digest =
  checksum.status === 0
    ? checksum.stdout
        .split(/\r?\n/)
        .slice(1)
        .find((line) => /^[0-9a-f ]{64,}$/i.test(line.trim()))
        ?.replace(/\s+/g, "")
        .toLowerCase()
    : undefined;
if (!digest) throw new Error(`Unable to calculate SHA256 for ${executable}: ${checksum.stderr || checksum.stdout}`);
writeFileSync(`${executable}.sha256`, `${digest}  ${path.basename(executable)}\n`, "utf8");
console.log(`Built ${executable}`);
console.log(`SHA256 ${digest}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${String(result.status)}`);
}
