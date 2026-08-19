import { renderOpencodeSidecarVerifyReport, verifyOpencodeSidecar, writeOpencodeSidecarLatest, type OpenCodeSidecarVerifyResult } from "../sidecar.js";
import type { OpenCodeSidecarRecorder } from "./events.js";

export interface IdleVerifier {
  markDirty: (type: string, payload?: Record<string, unknown>) => void;
  maybeVerifyOnIdle: () => Promise<OpenCodeSidecarVerifyResult | null>;
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

  async function maybeVerifyOnIdle(): Promise<OpenCodeSidecarVerifyResult | null> {
    const now = Date.now();
    if (!dirty) {
      recorder.log("debug", "idle verification skipped", { reason: "clean" });
      return null;
    }
    if (verifying) {
      recorder.log("debug", "idle verification skipped", { reason: "already verifying" });
      return null;
    }
    if (now - lastVerifyAt < debounceMs) {
      recorder.log("debug", "idle verification skipped", { reason: "debounced", elapsedMs: now - lastVerifyAt });
      return null;
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
      return verify;
    } catch (error) {
      recorder.log("error", "idle verification failed", { message: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      verifying = false;
      lastVerifyAt = Date.now();
    }
  }

  return { markDirty, maybeVerifyOnIdle };
}
