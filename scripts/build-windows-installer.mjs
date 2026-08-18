import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.join(root, ".installer-build");
const release = path.join(root, "release");
const pluginPath = path.join(staging, "opencode-plusplus-plugin.cjs");
const pluginGzipPath = path.join(staging, "opencode-plusplus-plugin.cjs.gz");
const nativeCommandPatchPath = path.join(staging, "native-command-patch.js");
const installerTemplate = path.join(root, "src/installer/windows-installer.cs");
const installerSource = path.join(staging, "windows-installer.generated.cs");
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
  minify: true,
  legalComments: "none"
});

const pluginModule = await import(`${pathToFileURL(pluginPath).href}?build=${Date.now()}`);
const pluginExports = [...new Set(Object.values(pluginModule))];
if (pluginExports.length !== 1 || typeof pluginExports[0] !== "function") {
  throw new Error("Bundled plugin must expose exactly one OpenCode plugin function.");
}

const pluginGzip = gzipSync(readFileSync(pluginPath), { level: 9 });
writeFileSync(pluginGzipPath, pluginGzip);
writeFileSync(nativeCommandPatchPath, readFileSync(path.join(root, "src/installer/native-command-patch.js")));
const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
writeFileSync(installerSource, readFileSync(installerTemplate, "utf8").replaceAll("__PACKAGE_VERSION__", packageVersion), "utf8");

const csc = findCsc();
run(csc, [
  "/nologo",
  "/target:exe",
  "/optimize+",
  "/platform:x64",
  "/utf8output",
  `/out:${executable}`,
  `/resource:${pluginGzipPath},OpenCodePlusPlus.Plugin.gz`,
  `/resource:${nativeCommandPatchPath},OpenCodePlusPlus.NativeCommandPatch.js`,
  "/reference:System.Web.Extensions.dll",
  "/reference:System.Windows.Forms.dll",
  installerSource
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
console.log(`Installer size ${statSync(executable).size} bytes; compressed plugin ${pluginGzip.length} bytes`);
console.log(`SHA256 ${digest}`);

function findCsc() {
  const windows = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
  const candidates = [
    path.join(windows, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windows, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
  ];
  const compiler = candidates.find(existsSync);
  if (!compiler) throw new Error(".NET Framework C# compiler was not found. Windows 10/11 with .NET Framework 4.x is required.");
  return compiler;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${String(result.status)}`);
}
