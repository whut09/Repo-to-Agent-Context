import type { ContextFeedbackConfig } from "../core/types.js";
import type { ContextFeedback } from "./types.js";

export type ContextFeedbackTransportStatus = "disabled" | "sent" | "failed";

export interface ContextFeedbackTransportResult {
  status: ContextFeedbackTransportStatus;
  endpoint?: string;
  error?: string;
}

export async function submitContextFeedback(
  feedback: ContextFeedback,
  config: ContextFeedbackConfig,
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {}
): Promise<ContextFeedbackTransportResult> {
  if (!config.enabled || !config.network || !config.telemetry || !config.endpoint) {
    return { status: "disabled", ...(config.endpoint ? { endpoint: config.endpoint } : {}) };
  }
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) return { status: "failed", endpoint: config.endpoint, error: "The runtime does not provide fetch." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
      signal: controller.signal
    });
    if (!response.ok) return { status: "failed", endpoint: config.endpoint, error: "Feedback endpoint returned HTTP " + response.status + "." };
    return { status: "sent", endpoint: config.endpoint };
  } catch (error) {
    return { status: "failed", endpoint: config.endpoint, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
