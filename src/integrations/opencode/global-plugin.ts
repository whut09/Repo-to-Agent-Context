import { createOpenCodePlusPlusSidecar } from "./plugin-runtime/index.js";
import type { OpenCodeSidecarRuntimeContext } from "./plugin-runtime/events.js";

export async function OpenCodePlusPlusGlobalPlugin(context: OpenCodeSidecarRuntimeContext): Promise<Record<string, unknown>> {
  return createOpenCodePlusPlusSidecar(context, { pluginInstalled: true });
}

export default OpenCodePlusPlusGlobalPlugin;
