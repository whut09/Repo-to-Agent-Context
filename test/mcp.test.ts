import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOpenCodePlusplusMcpTool, opencodePlusplusMcpToolNames } from "../src/mcp/server.js";
import { runGit } from "../src/core/git.js";

function createMcpRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-mcp-"));
  mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  mkdirSync(path.join(root, "src", "api"), { recursive: true });
  mkdirSync(path.join(root, "test", "auth"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", check: "tsc --noEmit" } }), "utf8");
  writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function refreshSessionTimeout() { return 'ok'; }\n", "utf8");
  writeFileSync(
    path.join(root, "src", "auth", "middleware.ts"),
    "import { refreshSessionTimeout } from './session.js';\nexport function authMiddleware() { return refreshSessionTimeout(); }\n",
    "utf8"
  );
  writeFileSync(
    path.join(root, "src", "api", "login.ts"),
    "import { authMiddleware } from '../auth/middleware.js';\nexport function loginApi() { return authMiddleware(); }\n",
    "utf8"
  );
  writeFileSync(
    path.join(root, "test", "auth", "session.test.ts"),
    "import { refreshSessionTimeout } from '../../src/auth/session.js';\nrefreshSessionTimeout();\n",
    "utf8"
  );
  return root;
}

test("mcp server exposes repo context tools", async () => {
  assert.deepEqual(opencodePlusplusMcpToolNames, [
    "opencode_plusplus_build",
    "opencode_plusplus_plan",
    "opencode_plusplus_pack",
    "opencode_plusplus_retrieve",
    "opencode_plusplus_context_feedback",
    "opencode_plusplus_tests",
    "opencode_plusplus_impact",
    "opencode_plusplus_verify",
    "opencode_plusplus_explain",
    "opencode_plusplus_start_loop",
    "opencode_plusplus_step",
    "opencode_plusplus_evaluate",
    "opencode_plusplus_repair",
    "opencode_plusplus_finalize"
  ]);
});

test("MCP context feedback returns local stats and stays offline", async () => {
  const root = createMcpRepo();
  try {
    const result = await executeOpenCodePlusplusMcpTool("opencode_plusplus_context_feedback", {
      repo: root,
      entryId: "official/payments",
      source: "official",
      revision: 1,
      target: "entry",
      label: "useful"
    });
    assert.equal(result.enabled, true);
    assert.equal((result.stats as { total: number }).total, 1);
    assert.equal((result.transport as { status: string }).status, "disabled");
    assert.match(String(result.note), /cannot satisfy evidence/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opencode_plusplus_retrieve returns hits and suggested commands", async () => {
  const root = createMcpRepo();
  try {
    const result = await executeOpenCodePlusplusMcpTool("opencode_plusplus_retrieve", {
      repo: root,
      task: "fix login timeout bug",
      provider: "hybrid",
      topK: 5,
      includeTests: true
    });
    const hits = result.hits as Array<{ path: string }>;
    const suggestedCommands = result.suggestedCommands as string[];

    assert.ok(Array.isArray(hits));
    assert.ok(hits.some((hit) => hit.path === "src/auth/session.ts"));
    assert.ok(suggestedCommands.some((command) => command.includes("npm run test")));
    assert.ok(suggestedCommands.some((command) => command.includes("check")));
    assert.equal(result.provider, "hybrid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opencode_plusplus_retrieve fetches a Context Registry entry through the application service", async () => {
  const root = createMcpRepo();
  try {
    const entryRoot = path.join(root, "packs", "docs", "payments");
    mkdirSync(path.join(entryRoot, "references"), { recursive: true });
    writeFileSync(
      path.join(entryRoot, "DOC.md"),
      "---\nname: payments\ndescription: Payments\nmetadata:\n  languages: typescript\n  versions: 1.0.0\n  revision: 1\n  updated-on: 2026-01-01\n  source: private\n---\nEntry.\n",
      "utf8"
    );
    writeFileSync(path.join(entryRoot, "references", "errors.md"), "Errors.\n", "utf8");
    writeFileSync(
      path.join(root, "opencode-plusplus.config.yml"),
      "contextRegistry:\n  enabled: true\n  offline: true\n  sources:\n    - name: private\n      kind: local\n      location: packs\n      trustLevel: private\n",
      "utf8"
    );
    const result = await executeOpenCodePlusplusMcpTool("opencode_plusplus_retrieve", {
      repo: root,
      task: "fetch payments",
      contextId: "private/payments",
      file: "docs/payments/references/errors.md"
    });
    assert.equal(result.fetchMode, "file");
    assert.deepEqual(result.selectedFiles, ["docs/payments/references/errors.md"]);
    assert.equal((result.files as Array<{ content: string }>)[0]?.content, "Errors.\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opencode_plusplus_verify includes contract check output", async () => {
  const root = createMcpRepo();
  try {
    runGit(root, ["init"]);
    runGit(root, ["checkout", "-b", "main"]);
    runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
    runGit(root, ["config", "user.name", "Repo Context"]);
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-m", "initial"]);
    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function refreshSessionTimeout() { return 'fixed'; }\n", "utf8");

    const result = await executeOpenCodePlusplusMcpTool("opencode_plusplus_verify", {
      repo: root,
      base: "main",
      diff: true
    });

    assert.match(String(result.markdown), /# Task Verify/);
    assert.match(String(result.markdown), /## Contract check/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mcp runtime tools drive an agent loop with trace and policy evidence", async () => {
  const root = createMcpRepo();
  try {
    runGit(root, ["init"]);
    runGit(root, ["checkout", "-b", "main"]);
    runGit(root, ["config", "user.email", "opencode-plusplus@example.com"]);
    runGit(root, ["config", "user.name", "Repo Context"]);
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-m", "initial"]);

    const started = await executeOpenCodePlusplusMcpTool("opencode_plusplus_start_loop", {
      repo: root,
      task: "fix login timeout bug",
      agent: "opencode",
      type: "bugfix",
      base: "main"
    });
    const traceId = String(started.traceId);
    assert.equal(started.runtime, "agent-native");
    assert.equal(traceId, "fix-login-timeout-bug");
    assert.ok(Array.isArray(started.mustInspect));
    assert.equal(typeof started.blocking, "boolean");
    assert.ok(Array.isArray(started.requiredCommands));
    assert.ok(Array.isArray(started.allowedEditGlobs));
    assert.ok(Array.isArray(started.avoidEditGlobs));
    assert.ok(Array.isArray(started.missingEvidence));
    assert.equal(typeof (started.nextAction as { action?: unknown }).action, "string");

    writeFileSync(path.join(root, "src", "auth", "session.ts"), "export function refreshSessionTimeout() { return 'fixed'; }\n", "utf8");

    const step = await executeOpenCodePlusplusMcpTool("opencode_plusplus_step", {
      repo: root,
      traceId,
      agent: "opencode",
      action: "edit",
      files: ["src/auth/session.ts"],
      reason: "timeout logic"
    });
    assert.equal(step.traceId, traceId);

    const missingEvidence = await executeOpenCodePlusplusMcpTool("opencode_plusplus_evaluate", {
      repo: root,
      task: "fix login timeout bug",
      traceId,
      type: "bugfix",
      base: "main",
      strict: true
    });
    assert.equal(missingEvidence.passed, false);
    assert.equal((missingEvidence.policy as { evidencePolicy?: string }).evidencePolicy, "strict");
    assert.equal(missingEvidence.blocking, true);
    assert.ok((missingEvidence.missingEvidence as string[]).some((item) => item.includes("test") || item.includes("contract")));
    assert.ok((missingEvidence.requiredCommands as string[]).length > 0);
    assert.ok(Array.isArray(missingEvidence.mustInspect));
    assert.match(String(missingEvidence.markdown), /Policy Engine/);

    const repair = await executeOpenCodePlusplusMcpTool("opencode_plusplus_repair", {
      repo: root,
      task: "fix login timeout bug",
      traceId,
      type: "bugfix",
      base: "main"
    });
    assert.equal(repair.blocking, true);
    assert.ok(Array.isArray(repair.allowedEditGlobs));
    assert.ok((repair.requiredActions as string[]).some((action) => action.includes("validate-contracts")));

    await executeOpenCodePlusplusMcpTool("opencode_plusplus_step", {
      repo: root,
      traceId,
      action: "run-test",
      command: "npm test -- test/auth/session.test.ts",
      result: "passed"
    });
    await executeOpenCodePlusplusMcpTool("opencode_plusplus_step", {
      repo: root,
      traceId,
      action: "validate-contracts",
      command: "opencode-plusplus validate-contracts . --base main",
      result: "passed"
    });
    await executeOpenCodePlusplusMcpTool("opencode_plusplus_build", {
      repo: root,
      target: "opencode"
    });

    const finalized = await executeOpenCodePlusplusMcpTool("opencode_plusplus_finalize", {
      repo: root,
      task: "fix login timeout bug",
      traceId,
      base: "main",
      finalState: "success"
    });
    assert.equal(finalized.passed, true);
    assert.equal(finalized.finalState, "success");
    assert.equal(finalized.blocking, false);
    assert.ok(Array.isArray(finalized.requiredCommands));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
