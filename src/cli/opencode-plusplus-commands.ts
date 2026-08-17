import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getOpenCodePlusplusPackageVersion, OPENCODE_PLUSPLUS_PACKAGE_NAME } from "../core/package-info.js";
import { runOpencodeDoctor, type OpencodeDoctorCheck } from "./opencode-preset.js";
import { OPENCODE_SIDECAR_PLUGIN_PATH } from "../integrations/opencode/sidecar.js";
import { defaultOpenCodePlusPlusPluginFile, readOpenCodePlusPlusPluginStatus } from "../integrations/opencode/plugin-runtime/state.js";
import { verifyOpencodeSidecar } from "../integrations/opencode/sidecar.js";

export interface OpenCodePlusplusStatusReport {
  repo: string;
  active: boolean;
  pluginExists: boolean;
  contextExists: boolean;
  eventLogExists: boolean;
  latestExists: boolean;
  latestPath: string;
  latestMtime: string | null;
  blockers: string[];
}

export interface OpenCodePlusplusDoctorReport {
  repo: string;
  ok: boolean;
  checks: OpencodeDoctorCheck[];
}

export function readOpenCodePlusplusReport(repo = "."): { path: string; content: string; exists: boolean } {
  const root = path.resolve(repo);
  const reportPath = path.join(root, ".agent-context", "sidecar", "latest.md");
  if (!existsSync(reportPath)) {
    return {
      path: reportPath,
      content: [
        "OpenCode++ report is not available yet.",
        "",
        "Run `opencode-plusplus` to start OpenCode with the sidecar, or run `opencode-plusplus sidecar verify .` once to generate the first report."
      ].join("\n"),
      exists: false
    };
  }
  return { path: reportPath, content: readFileSync(reportPath, "utf8"), exists: true };
}

export function getOpenCodePlusplusStatus(repo = "."): OpenCodePlusplusStatusReport {
  const root = path.resolve(repo);
  const globalPluginPath = defaultOpenCodePlusPlusPluginFile();
  const pluginPath = existsSync(globalPluginPath) ? globalPluginPath : path.join(root, OPENCODE_SIDECAR_PLUGIN_PATH);
  const pluginExists = existsSync(pluginPath);
  const pluginStatus = readOpenCodePlusPlusPluginStatus();
  const contextPath = path.join(root, ".agent-context");
  const eventLogPath = path.join(root, ".agent-context", "traces", "opencode-sidecar-events.jsonl");
  const latestPath = path.join(root, ".agent-context", "sidecar", "latest.json");
  const latest = readLatestJson(latestPath);
  const latestExists = existsSync(latestPath);
  const latestMtime = latestExists ? statSync(latestPath).mtime.toISOString() : null;
  const blockers = Array.isArray(latest?.blockers) ? latest.blockers.filter((item): item is string => typeof item === "string") : [];

  return {
    repo: root,
    active: pluginExists && (pluginPath === globalPluginPath ? pluginStatus.enabled : existsSync(contextPath)),
    pluginExists,
    contextExists: existsSync(contextPath),
    eventLogExists: existsSync(eventLogPath),
    latestExists,
    latestPath,
    latestMtime,
    blockers
  };
}

export async function runOpenCodePlusplusDoctor(repo = "."): Promise<OpenCodePlusplusDoctorReport> {
  const root = path.resolve(repo);
  const opencode = runOpencodeDoctor(root);
  const sidecar = await verifyOpencodeSidecar(root);
  const globalPluginPath = defaultOpenCodePlusPlusPluginFile();
  const globalPluginExists = existsSync(globalPluginPath);
  const pluginPath = globalPluginExists ? globalPluginPath : path.join(root, OPENCODE_SIDECAR_PLUGIN_PATH);
  const pluginStatus = readOpenCodePlusPlusPluginStatus();
  const sidecarPluginCheck = sidecar.checks.find((check) => check.name === "global-plugin" || check.name.endsWith("opencode-plusplus.ts"));
  const versionCheck = globalPluginExists
    ? buildInstalledPluginVersionCheck(pluginStatus.version, pluginStatus.diagnostic)
    : buildOpenCodePlusplusVersionCheck(pluginPath);
  const pluginExists = existsSync(pluginPath);
  const globalPlugin = pluginPath === globalPluginPath;
  const hookChecks = sidecar.checks.filter((check) => ["file.edited hook", "session.idle hook", "tool.execute.after hook"].includes(check.name));
  const sidecarChecks: OpencodeDoctorCheck[] = [
    versionCheck,
    {
      id: "sidecar-plugin",
      label: "OpenCode++ sidecar plugin",
      status: sidecarPluginCheck?.status === "pass" ? "pass" : pluginExists ? "fail" : "warn",
      details:
        sidecarPluginCheck?.status === "pass"
          ? sidecarPluginCheck.details
          : pluginExists
            ? (sidecarPluginCheck?.details ?? "sidecar plugin check unavailable")
            : globalPlugin
              ? "global OpenCode plugin is not ready; run the Windows installer again"
              : `not installed yet; run the Windows OpenCode++ installer or use \`opencode-plusplus opencode init\` for project helpers`
    },
    {
      id: "sidecar-hooks",
      label: "Sidecar hooks",
      status: pluginExists
        ? globalPlugin
          ? sidecar.checks.some((check) => check.name === "plugin-source" && check.status === "pass")
            ? "pass"
            : "fail"
          : hookChecks.length > 0 && hookChecks.every((check) => check.status === "pass")
            ? "pass"
            : "fail"
        : "warn",
      details: pluginExists
        ? globalPlugin
          ? "global plugin bundle provides file, session, and tool hooks"
          : "checks file.edited, session.idle, and tool.execute.after hooks"
        : "plugin not generated yet; hooks unavailable until first launch"
    },
    {
      id: "sidecar-latest",
      label: "Sidecar latest report",
      status: existsSync(sidecar.latestJsonPath) || existsSync(sidecar.latestMarkdownPath) ? "pass" : "warn",
      details: existsSync(sidecar.latestMarkdownPath)
        ? ".agent-context/sidecar/latest.md found"
        : "run `opencode-plusplus sidecar verify .` after starting a session"
    }
  ];
  const checks = [...opencode.checks, ...sidecarChecks];
  return { repo: root, ok: checks.every((check) => check.status !== "fail"), checks };
}

export interface OpenCodePlusplusPluginMetadata {
  generatedBy?: string;
  headerVersion?: string;
  constantVersion?: string;
  generatedAt?: string;
}

export function readOpenCodePlusplusPluginMetadata(pluginPath: string): OpenCodePlusplusPluginMetadata | undefined {
  if (!existsSync(pluginPath)) return undefined;
  const source = readFileSync(pluginPath, "utf8");
  return {
    generatedBy: matchSource(source, /Generated by:\s*([^\r\n*]+)/),
    headerVersion: matchSource(source, /Package version:\s*([^\r\n*]+)/),
    generatedAt: matchSource(source, /(?:Generated at:\s*([^\r\n*]+)|OPENCODE_PLUSPLUS_GENERATED_AT\s*=\s*["']([^"']+)["'])/),
    constantVersion: matchSource(source, /OPENCODE_PLUSPLUS_PLUGIN_VERSION\s*=\s*["']([^"']+)["']/)
  };
}

function buildOpenCodePlusplusVersionCheck(pluginPath: string): OpencodeDoctorCheck {
  const cliVersion = getOpenCodePlusplusPackageVersion();
  const metadata = readOpenCodePlusplusPluginMetadata(pluginPath);
  if (!metadata) {
    return {
      id: "opencode-plusplus-version",
      label: "CLI/plugin version",
      status: "warn",
      details: `CLI ${cliVersion}; sidecar plugin not generated yet`
    };
  }

  const pluginVersion = metadata.constantVersion ?? metadata.headerVersion ?? "unknown";
  const generatedByCurrentCli =
    metadata.generatedBy === OPENCODE_PLUSPLUS_PACKAGE_NAME && metadata.headerVersion === cliVersion && metadata.constantVersion === cliVersion;
  return {
    id: "opencode-plusplus-version",
    label: "CLI/plugin version",
    status: generatedByCurrentCli ? "pass" : "warn",
    details: generatedByCurrentCli
      ? `${cliVersion} (generated at ${metadata.generatedAt ?? "unknown"})`
      : `CLI ${cliVersion}; plugin ${pluginVersion}; generatedBy ${metadata.generatedBy ?? "unknown"}; generatedAt ${metadata.generatedAt ?? "unknown"}`
  };
}

function buildInstalledPluginVersionCheck(version: string, diagnostic: string | null): OpencodeDoctorCheck {
  return {
    id: "opencode-plusplus-version",
    label: "CLI/plugin version",
    status: diagnostic ? "warn" : version === getOpenCodePlusplusPackageVersion() ? "pass" : "warn",
    details: diagnostic ?? `CLI ${getOpenCodePlusplusPackageVersion()}; installed plugin ${version}`
  };
}

export function renderOpenCodePlusplusStatus(report: OpenCodePlusplusStatusReport): string {
  return [
    "OpenCode++ Status",
    "",
    `Repo: ${report.repo}`,
    `Sidecar: ${report.active ? "active" : "not active"}`,
    "",
    "Signals:",
    `- plugin: ${report.pluginExists ? "yes" : "no"}`,
    `- context: ${report.contextExists ? "yes" : "no"}`,
    `- event log: ${report.eventLogExists ? "yes" : "no"}`,
    `- latest report: ${report.latestExists ? "yes" : "no"}`,
    `- latest updated: ${report.latestMtime ?? "never"}`,
    "",
    "Blockers:",
    ...(report.blockers.length ? report.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Next:",
    report.active ? "  opencode-plusplus report" : "  opencode-plusplus"
  ].join("\n");
}

export function renderOpenCodePlusplusDoctor(report: OpenCodePlusplusDoctorReport): string {
  return [
    "OpenCode++ Doctor",
    "",
    `Repo: ${report.repo}`,
    "",
    ...report.checks.map((check) => {
      const marker = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
      const command = check.command ? `\n  Command: ${check.command}` : "";
      return `- [${marker}] ${check.label}: ${check.details}${command}`;
    }),
    "",
    report.ok ? "Result: ready for `opencode-plusplus`." : "Result: not ready. Fix failed checks before using `opencode-plusplus`."
  ].join("\n");
}

function readLatestJson(filePath: string): { blockers?: unknown } | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as { blockers?: unknown };
  } catch {
    return null;
  }
}

function matchSource(source: string, pattern: RegExp): string | undefined {
  const match = source.match(pattern);
  return (match?.[1] ?? match?.[2])?.trim();
}
