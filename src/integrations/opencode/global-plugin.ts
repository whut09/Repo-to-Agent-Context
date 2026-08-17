import { fileURLToPath } from "node:url";
import { createOpenCodePlusPlusSidecar } from "./plugin-runtime/index.js";
import type { OpenCodeSidecarRuntimeContext } from "./plugin-runtime/events.js";

const pluginPath = fileURLToPath(import.meta.url);

export async function OpenCodePlusPlusGlobalPlugin(context: OpenCodeSidecarRuntimeContext): Promise<Record<string, unknown>> {
  return createOpenCodePlusPlusSidecar(context, { pluginPath });
}

export default OpenCodePlusPlusGlobalPlugin;
