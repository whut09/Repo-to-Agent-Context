export interface ProtectedPathFinding {
  kind: "protected_path" | "secret_path";
  severity: "blocker";
  message: string;
  evidence: string[];
}

export function normalizeToolPath(value: string): string {
  return value
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

export function isGeneratedSidecarOutput(filePath: string): boolean {
  return filePath === ".agent-context/sidecar/latest.json" || filePath === ".agent-context/sidecar/latest.md";
}

export function isSecretLike(file: string): boolean {
  return /(^|\/)(\.env|.*\.local\.(yml|yaml|json)|opencode-plusplus\.local\.yml)$/i.test(file);
}

export function checkProtectedPath(filePath: string): ProtectedPathFinding[] {
  const normalized = normalizeToolPath(filePath);
  const findings: ProtectedPathFinding[] = [];
  if (!normalized) return findings;
  if (isSecretLike(normalized)) {
    findings.push({ kind: "secret_path", severity: "blocker", message: `Blocked secret/local config path: ${normalized}`, evidence: [normalized] });
  }
  if (normalized.startsWith(".agent-context/") && !isGeneratedSidecarOutput(normalized)) {
    findings.push({ kind: "protected_path", severity: "blocker", message: `Blocked generated context path: ${normalized}`, evidence: [normalized] });
  }
  if (normalized === "AGENTS.md") {
    findings.push({
      kind: "protected_path",
      severity: "blocker",
      message: "Blocked generated AGENTS.md path; edit AGENTS.manual.md or regenerate context instead.",
      evidence: [normalized]
    });
  }
  if (normalized.includes("node_modules/") || normalized.startsWith("dist/") || normalized.startsWith("coverage/")) {
    findings.push({ kind: "protected_path", severity: "blocker", message: `Blocked dependency/build output path: ${normalized}`, evidence: [normalized] });
  }
  return findings;
}
