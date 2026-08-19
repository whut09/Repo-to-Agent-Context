export interface ProtectedPathFinding {
  kind: "protected_path" | "secret_path";
  severity: "blocker" | "warning";
  message: string;
  evidence: string[];
  doInstead?: string;
  rule?: string;
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
    findings.push({
      kind: "secret_path",
      severity: "blocker",
      rule: "secret-local-config",
      message: `Secret/local config path 密钥/本地配置路径: ${normalized}`,
      doInstead:
        "Do not edit .env or *.local.* files; OpenCode already guards secret reads. 如需配置变更，改普通配置文件并说明原因。",
      evidence: [normalized]
    });
  }
  if (normalized.startsWith(".agent-context/") && !isGeneratedSidecarOutput(normalized)) {
    findings.push({
      kind: "protected_path",
      severity: "blocker",
      rule: "generated-context",
      message: `Generated context path 生成的 context 文件: ${normalized}`,
      doInstead: "Regenerate context via opencode_plusplus_prepare/build instead of hand-editing. 让 harness 重新生成，不要手改。",
      evidence: [normalized]
    });
  }
  if (normalized === "AGENTS.md") {
    findings.push({
      kind: "protected_path",
      severity: "blocker",
      rule: "generated-agents-md",
      message: "Generated AGENTS.md 生成的 AGENTS.md",
      doInstead: "Edit AGENTS.manual.md and regenerate context. 改 AGENTS.manual.md 再重新生成 context。",
      evidence: [normalized]
    });
  }
  if (isBuildOutputPath(normalized)) {
    findings.push({
      kind: "protected_path",
      severity: "blocker",
      rule: "dependency-build-output",
      message: `Dependency/build output path 依赖/构建产物路径: ${normalized}`,
      doInstead: "Run the real build or test script to regenerate outputs instead of editing them. 用真实 script 重新生成，不要手改产物。",
      evidence: [normalized]
    });
  } else if (looksLikeEmbeddedBuildOutputPath(normalized)) {
    findings.push({
      kind: "protected_path",
      severity: "warning",
      rule: "dependency-build-output-uncertain",
      message: `Uncertain dependency/build path argument 不确定的产物/依赖路径参数: ${normalized}`,
      doInstead: "Confirm the argument is a repository-relative path before touching it. 先确认参数是仓库内路径再操作。",
      evidence: [normalized]
    });
  }
  return findings;
}

function isBuildOutputPath(filePath: string): boolean {
  return filePath.startsWith("node_modules/") || filePath.startsWith("dist/") || filePath.startsWith("coverage/");
}

function looksLikeEmbeddedBuildOutputPath(filePath: string): boolean {
  return filePath.includes("node_modules/") || filePath.includes("dist/") || filePath.includes("coverage/");
}
