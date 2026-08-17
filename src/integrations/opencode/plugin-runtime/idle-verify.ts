import { renderOpencodeSidecarVerifyReport, verifyOpencodeSidecar, writeOpencodeSidecarLatest } from "../sidecar.js";
import type { OpenCodeSidecarRecorder } from "./events.js";

export interface IdleVerifier {
  markDirty: (type: string, payload?: Record<string, unknown>) => void;
  maybeVerifyOnIdle: () => Promise<void>;
}

export function createIdleVerifier(
  directory: string,
  recorder: OpenCodeSidecarRecorder,
  debounceMs = 2000,
  pluginPath?: string,
  pluginInstalled = false
): IdleVerifier {
  let dirty = false;
  let verifying = false;
  let lastVerifyAt = 0;

  function markDirty(type: string, payload: Record<string, unknown> = {}): void {
    dirty = true;
    recorder.record(type, payload);
    recorder.log("debug", "repository marked dirty", { type, ...payload });
  }

  async function maybeVerifyOnIdle(): Promise<void> {
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
      const verify = await verifyOpencodeSidecar(directory, { pluginPath, pluginInstalled });
      writeOpencodeSidecarLatest(verify);
      recorder.record("sidecar.verify", { exitCode: verify.ok ? 0 : 1 });
      if (!verify.ok) {
        recorder.log("error", "sidecar verification blocked", { exitCode: 1 });
        console.log(renderOpencodeSidecarVerifyReport(verify));
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
