import { hashContextText } from "./hash.js";
import { validateContextPack } from "./validators.js";
import type { ContextPack, ContextSourceConfig } from "./types.js";

export interface RemoteContextFetchOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface RemoteContextFetchResult {
  pack: ContextPack;
  fetchedAt: string;
  contentHash: string;
  sizeBytes: number;
}

export class ContextSourceFetchError extends Error {
  constructor(
    readonly sourceName: string,
    readonly code: "url" | "network" | "timeout" | "status" | "size" | "hash" | "json" | "schema",
    message: string
  ) {
    super(`Context source ${sourceName}: ${message}`);
  }
}

export async function fetchRemoteContextPack(source: ContextSourceConfig, options: RemoteContextFetchOptions = {}): Promise<RemoteContextFetchResult> {
  if (source.kind !== "remote") throw new ContextSourceFetchError(source.name, "url", "expected a remote source");
  let url: URL;
  try {
    url = new URL(source.location);
  } catch {
    throw new ContextSourceFetchError(source.name, "url", "location must be an absolute HTTP(S) URL");
  }
  if (![/^https:$/.test(url.protocol), /^http:$/.test(url.protocol)].some(Boolean)) {
    throw new ContextSourceFetchError(source.name, "url", "only HTTP(S) URLs are allowed");
  }
  if (!source.sha256) {
    throw new ContextSourceFetchError(source.name, "hash", "remote sources require a configured sha256 digest");
  }

  const timeoutMs = source.timeoutMs ?? 5_000;
  const maxBytes = source.maxBytes ?? 5 * 1024 * 1024;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(url, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    clearTimeout(timeout);
    if (controller.signal.aborted) throw new ContextSourceFetchError(source.name, "timeout", `request exceeded ${timeoutMs}ms`);
    throw new ContextSourceFetchError(source.name, "network", error instanceof Error ? error.message : String(error));
  }
  try {
    if (!response.ok) throw new ContextSourceFetchError(source.name, "status", `HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ContextSourceFetchError(source.name, "size", `response exceeds ${maxBytes} bytes`);
    }
    const bytes = await readLimitedBody(response, maxBytes, source.name);
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const contentHash = hashContextText(content);
    if (source.sha256 && contentHash.toLowerCase() !== source.sha256.toLowerCase()) {
      throw new ContextSourceFetchError(source.name, "hash", `SHA-256 mismatch: expected ${source.sha256}, received ${contentHash}`);
    }
    let input: unknown;
    try {
      input = JSON.parse(content);
    } catch (error) {
      throw new ContextSourceFetchError(source.name, "json", error instanceof Error ? error.message : String(error));
    }
    const validated = validateContextPack(input);
    if (!validated.valid) {
      throw new ContextSourceFetchError(source.name, "schema", validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    }
    if (validated.value!.sourceName !== source.name) {
      throw new ContextSourceFetchError(source.name, "schema", `pack sourceName must be ${source.name}`);
    }
    return { pack: applyConfiguredTrust(validated.value!, source), fetchedAt: new Date().toISOString(), contentHash, sizeBytes: bytes.byteLength };
  } catch (error) {
    if (controller.signal.aborted) throw new ContextSourceFetchError(source.name, "timeout", `request exceeded ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function applyConfiguredTrust(pack: ContextPack, source: ContextSourceConfig): ContextPack {
  return {
    ...pack,
    entries: pack.entries.map((entry) => ({
      ...entry,
      sourceName: source.name,
      trustLevel: source.trustLevel,
      provenance: { ...entry.provenance, sourceName: source.name, sourceTrustLevel: source.trustLevel, verified: false }
    }))
  };
}

async function readLimitedBody(response: Response, maxBytes: number, sourceName: string): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ContextSourceFetchError(sourceName, "size", `response exceeds ${maxBytes} bytes`);
    }
    chunks.push(result.value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
