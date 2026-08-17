import { runOpenCodePlusPlusCli } from "./cli-runner.js";
import type { OpenCodeSidecarRecorder } from "./events.js";

export interface IdleVerifier {
  markDirty: (type: string, payload?: Record<string, unknown>) => void;
  maybeVerifyOnIdle: () => void;
}

export function createIdleVerifier(directory: string, recorder: OpenCodeSidecarRecorder, debounceMs = 2000): IdleVerifier {
  let dirty = false;
  let verifying = false;
  let lastVerifyAt = 0;

  function markDirty(type: string, payload: Record<string, unknown> = {}): void {
    dirty = true;
    recorder.record(type, payload);
    recorder.log("debug", "repository marked dirty", { type, ...payload });
  }

  function maybeVerifyOnIdle(): void {
    const now = Date.now();
    if (!dirty) {
      recorder.log("debug", "idle verification skipped", { reason: "clean" });
      return;
    }
    if (verifying) {
      recorder.log("debug", "idle verification skipped", { reason: "already verifying" });
      return;
    }
    if (now - lastVerifyAt < debounceMs) {
      recorder.log("debug", "idle verification skipped", { reason: "debounced", elapsedMs: now - lastVerifyAt });
      return;
    }

    verifying = true;
    dirty = false;
    try {
      const verify = runOpenCodePlusPlusCli(["sidecar", "verify", directory, "--quiet"], directory);
      recorder.record("sidecar.verify", { exitCode: verify.status ?? 1 });
      if ((verify.status ?? 1) !== 0) {
        const output = (verify.stdout || verify.stderr || "OpenCode++ sidecar found blockers. Run opencode-plusplus report.").trim();
        recorder.log("error", "sidecar verification blocked", { exitCode: verify.status ?? 1 });
        console.log(output);
      } else {
        recorder.log("debug", "sidecar verification passed");
      }
    } finally {
      verifying = false;
      lastVerifyAt = Date.now();
    }
  }

  return { markDirty, maybeVerifyOnIdle };
}
