import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { DEFAULT_CONFIG } from "./defaults.js";
import type {
  AgentTarget,
  AgentsMode,
  AgentsSection,
  ContextFeedbackConfig,
  ContextRegistryConfig,
  EvidencePolicyMode,
  OpenCodePlusplusConfig,
  TokenizerMode
} from "../core/types.js";
import type { ContextSourceConfig, ContextSourceKind, ContextTrustLevel } from "../context-registry/types.js";

const CONFIG_FILES = ["opencode-plusplus.config.yml", "opencode-plusplus.config.yaml", "opencode-plusplus.config.json"];

const LOCAL_CONFIG_FILES = ["opencode-plusplus.local.yml", "opencode-plusplus.local.yaml", "opencode-plusplus.local.json"];

export function loadConfig(repoRoot: string, overrides: Partial<OpenCodePlusplusConfig> = {}): OpenCodePlusplusConfig {
  const configPath = CONFIG_FILES.map((file) => path.join(repoRoot, file)).find(existsSync);
  const localConfigPath = LOCAL_CONFIG_FILES.map((file) => path.join(repoRoot, file)).find(existsSync);
  const fileConfig = configPath ? readConfigFile(configPath) : {};
  const localConfig = localConfigPath ? readConfigFile(localConfigPath) : {};

  const config: OpenCodePlusplusConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...localConfig,
    ...overrides,
    include: overrides.include ?? localConfig.include ?? fileConfig.include ?? DEFAULT_CONFIG.include,
    exclude: [...DEFAULT_CONFIG.exclude, ...(fileConfig.exclude ?? []), ...(localConfig.exclude ?? []), ...(overrides.exclude ?? [])],
    contextRegistry: {
      ...DEFAULT_CONFIG.contextRegistry,
      ...fileConfig.contextRegistry,
      ...localConfig.contextRegistry,
      ...overrides.contextRegistry,
      sources:
        overrides.contextRegistry?.sources ??
        localConfig.contextRegistry?.sources ??
        fileConfig.contextRegistry?.sources ??
        DEFAULT_CONFIG.contextRegistry.sources
    },
    feedback: {
      ...DEFAULT_CONFIG.feedback,
      ...fileConfig.feedback,
      ...localConfig.feedback,
      ...overrides.feedback
    },
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...fileConfig.llm,
      ...localConfig.llm,
      ...overrides.llm
    },
    rag: {
      ...DEFAULT_CONFIG.rag,
      ...fileConfig.rag,
      ...localConfig.rag,
      ...overrides.rag
    },
    tokenizer: {
      ...DEFAULT_CONFIG.tokenizer,
      ...fileConfig.tokenizer,
      ...localConfig.tokenizer,
      ...overrides.tokenizer
    },
    agents: {
      ...DEFAULT_CONFIG.agents,
      ...fileConfig.agents,
      ...localConfig.agents,
      ...overrides.agents,
      include: overrides.agents?.include ?? localConfig.agents?.include ?? fileConfig.agents?.include ?? DEFAULT_CONFIG.agents.include,
      manualSources:
        overrides.agents?.manualSources ?? localConfig.agents?.manualSources ?? fileConfig.agents?.manualSources ?? DEFAULT_CONFIG.agents.manualSources
    },
    outputs: {
      ...DEFAULT_CONFIG.outputs,
      ...fileConfig.outputs,
      ...localConfig.outputs,
      ...overrides.outputs
    }
  };

  validateConfig(config);
  return config;
}

function readConfigFile(configPath: string): Partial<OpenCodePlusplusConfig> {
  const raw = readFileSync(configPath, "utf8");
  try {
    const parsed = configPath.endsWith(".json") ? (JSON.parse(raw) as Record<string, unknown>) : (yaml.load(raw) as Record<string, unknown>);
    validateRawConfig(parsed, configPath);
    return normalizeConfig(parsed);
  } catch (error) {
    throw new Error(`Invalid config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeConfig(input: Record<string, unknown> | null | undefined): Partial<OpenCodePlusplusConfig> {
  if (!input) {
    return {};
  }

  const target = typeof input.target === "string" ? (input.target as AgentTarget) : undefined;
  return stripUndefined({
    target,
    evidencePolicy: typeof input.evidencePolicy === "string" ? (input.evidencePolicy as EvidencePolicyMode) : undefined,
    contextRegistry:
      typeof input.contextRegistry === "object" && input.contextRegistry
        ? normalizeContextRegistryConfig(input.contextRegistry as Record<string, unknown>)
        : undefined,
    feedback: typeof input.feedback === "object" && input.feedback ? normalizeFeedbackConfig(input.feedback as Record<string, unknown>) : undefined,
    tokenBudget: typeof input.tokenBudget === "number" ? input.tokenBudget : undefined,
    include: toStringArray(input.include),
    exclude: toStringArray(input.exclude),
    llm: typeof input.llm === "object" && input.llm ? (input.llm as OpenCodePlusplusConfig["llm"]) : undefined,
    rag: typeof input.rag === "object" && input.rag ? (input.rag as OpenCodePlusplusConfig["rag"]) : undefined,
    tokenizer: typeof input.tokenizer === "object" && input.tokenizer ? normalizeTokenizerConfig(input.tokenizer as Record<string, unknown>) : undefined,
    agents: typeof input.agents === "object" && input.agents ? normalizeAgentsConfig(input.agents as Record<string, unknown>) : undefined,
    outputs: typeof input.outputs === "object" && input.outputs ? (input.outputs as OpenCodePlusplusConfig["outputs"]) : undefined
  }) as Partial<OpenCodePlusplusConfig>;
}

function normalizeContextRegistryConfig(input: Record<string, unknown>): Partial<ContextRegistryConfig> {
  return stripUndefined({
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    offline: typeof input.offline === "boolean" ? input.offline : undefined,
    sources: Array.isArray(input.sources) ? input.sources.map(normalizeContextSourceConfig) : undefined
  });
}

function normalizeFeedbackConfig(input: Record<string, unknown>): Partial<ContextFeedbackConfig> {
  return stripUndefined({
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    telemetry: typeof input.telemetry === "boolean" ? input.telemetry : undefined,
    network: typeof input.network === "boolean" ? input.network : undefined,
    useLocalQualitySignals: typeof input.useLocalQualitySignals === "boolean" ? input.useLocalQualitySignals : undefined,
    endpoint: typeof input.endpoint === "string" ? input.endpoint : undefined
  });
}

function normalizeContextSourceConfig(input: unknown): ContextSourceConfig {
  const source = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  return {
    name: String(source.name ?? ""),
    kind: String(source.kind ?? "local") as ContextSourceKind,
    location: String(source.location ?? ""),
    trustLevel: String(source.trustLevel ?? "untrusted") as ContextTrustLevel,
    ...(typeof source.timeoutMs === "number" ? { timeoutMs: source.timeoutMs } : {}),
    ...(typeof source.maxBytes === "number" ? { maxBytes: source.maxBytes } : {}),
    ...(typeof source.sha256 === "string" ? { sha256: source.sha256 } : {}),
    ...(typeof source.cacheTtlMs === "number" ? { cacheTtlMs: source.cacheTtlMs } : {}),
    ...(typeof source.enabled === "boolean" ? { enabled: source.enabled } : {})
  };
}

export function validateConfig(config: OpenCodePlusplusConfig): void {
  if (!["opencode", "codex", "claude", "cursor", "all"].includes(config.target)) {
    throw new Error(`Invalid target "${config.target}". Expected one of: opencode, codex, claude, cursor, all.`);
  }
  if (!["advisory", "balanced", "strict"].includes(config.evidencePolicy)) {
    throw new Error(`Invalid evidencePolicy "${config.evidencePolicy}". Expected one of: advisory, balanced, strict.`);
  }
  validateFeedbackConfig(config.feedback);
  if (!Number.isFinite(config.tokenBudget) || config.tokenBudget <= 0) {
    throw new Error("tokenBudget must be a positive number.");
  }
  if (config.rag.provider !== "lightrag" || !Number.isFinite(config.rag.chunkTokenLimit) || config.rag.chunkTokenLimit <= 0) {
    throw new Error("rag.chunkTokenLimit must be a positive number and rag.provider must be lightrag.");
  }
  if (!["chars_approx", "cl100k_base", "o200k_base"].includes(config.tokenizer.mode)) {
    throw new Error(`Invalid tokenizer.mode "${config.tokenizer.mode}". Expected one of: chars_approx, cl100k_base, o200k_base.`);
  }
  if (!["minimal", "balanced", "full"].includes(config.agents.mode)) {
    throw new Error(`Invalid agents.mode "${config.agents.mode}". Expected one of: minimal, balanced, full.`);
  }
  if (!Number.isFinite(config.agents.maxTokens) || config.agents.maxTokens <= 0) {
    throw new Error("agents.maxTokens must be a positive number.");
  }
  if (!Array.isArray(config.agents.manualSources) || config.agents.manualSources.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error("agents.manualSources must be an array of non-empty strings.");
  }
  const allowedSections = new Set(["commands", "safety", "entrypoints", "contextLinks"]);
  for (const section of config.agents.include) {
    if (!allowedSections.has(section)) {
      throw new Error(`Invalid agents.include item "${section}". Expected one of: commands, safety, entrypoints, contextLinks.`);
    }
  }
  if (config.llm.enabled) {
    for (const [field, value] of [
      ["baseUrl", config.llm.baseUrl],
      ["apiKey", config.llm.apiKey],
      ["model", config.llm.model]
    ]) {
      if (!value || value.trim().toLowerCase() === "xx") {
        throw new Error(`llm.${field} must be configured when llm.enabled is true.`);
      }
    }
  }
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function validateRawConfig(input: Record<string, unknown> | null | undefined, source: string): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("config root must be an object.");
  }
  if (input.target !== undefined && (typeof input.target !== "string" || !["opencode", "codex", "claude", "cursor", "all"].includes(input.target))) {
    throw new Error(`Invalid target "${String(input.target)}". Expected one of: opencode, codex, claude, cursor, all.`);
  }
  if (input.evidencePolicy !== undefined && (typeof input.evidencePolicy !== "string" || !["advisory", "balanced", "strict"].includes(input.evidencePolicy))) {
    throw new Error(`Invalid evidencePolicy "${String(input.evidencePolicy)}". Expected one of: advisory, balanced, strict.`);
  }
  if (input.contextRegistry !== undefined) {
    const registry = objectValue(input.contextRegistry, "contextRegistry");
    if (registry.enabled !== undefined && typeof registry.enabled !== "boolean") throw new Error("contextRegistry.enabled must be boolean.");
    if (registry.offline !== undefined && typeof registry.offline !== "boolean") throw new Error("contextRegistry.offline must be boolean.");
    if (registry.sources !== undefined) {
      if (!Array.isArray(registry.sources)) throw new Error("contextRegistry.sources must be an array.");
      registry.sources.forEach(validateContextSourceConfig);
      const names = registry.sources.map((source) => String((source as Record<string, unknown>).name));
      if (new Set(names).size !== names.length) throw new Error("contextRegistry.sources names must be unique.");
    }
  }
  if (input.feedback !== undefined) validateRawFeedbackConfig(input.feedback);
  if (input.tokenBudget !== undefined && (typeof input.tokenBudget !== "number" || input.tokenBudget <= 0)) {
    throw new Error("tokenBudget must be a positive number.");
  }
  for (const field of ["include", "exclude"]) {
    const value = input[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) {
      throw new Error(`${field} must be an array of strings.`);
    }
  }
  validateBooleanObject(input.outputs, "outputs", new Set(["agents", "modules", "graph", "tasks", "readiness", "rag"]));
  if (input.rag !== undefined) {
    const rag = objectValue(input.rag, "rag");
    if (rag.provider !== undefined && rag.provider !== "lightrag") {
      throw new Error("rag.provider must be lightrag.");
    }
    if (rag.chunkTokenLimit !== undefined && (typeof rag.chunkTokenLimit !== "number" || rag.chunkTokenLimit <= 0)) {
      throw new Error("rag.chunkTokenLimit must be a positive number.");
    }
  }
  if (input.llm !== undefined) {
    const llm = objectValue(input.llm, "llm");
    if (llm.provider !== undefined && llm.provider !== "openai-compatible") {
      throw new Error("llm.provider must be openai-compatible.");
    }
    if (llm.enabled !== undefined && typeof llm.enabled !== "boolean") {
      throw new Error("llm.enabled must be boolean.");
    }
  }
  if (input.tokenizer !== undefined) {
    const tokenizer = objectValue(input.tokenizer, "tokenizer");
    if (tokenizer.mode !== undefined && (typeof tokenizer.mode !== "string" || !["chars_approx", "cl100k_base", "o200k_base"].includes(tokenizer.mode))) {
      throw new Error("tokenizer.mode must be one of: chars_approx, cl100k_base, o200k_base.");
    }
    if (tokenizer.model !== undefined && typeof tokenizer.model !== "string") {
      throw new Error("tokenizer.model must be a string.");
    }
  }
  if (input.agents !== undefined) {
    const agents = objectValue(input.agents, "agents");
    if (agents.mode !== undefined && (typeof agents.mode !== "string" || !["minimal", "balanced", "full"].includes(agents.mode))) {
      throw new Error(`Invalid agents.mode "${String(agents.mode)}". Expected one of: minimal, balanced, full.`);
    }
    if (agents.maxTokens !== undefined && (typeof agents.maxTokens !== "number" || agents.maxTokens <= 0)) {
      throw new Error("agents.maxTokens must be a positive number.");
    }
    const allowedSections = new Set(["commands", "safety", "entrypoints", "contextLinks"]);
    if (
      agents.include !== undefined &&
      (!Array.isArray(agents.include) || agents.include.some((item) => typeof item !== "string" || !allowedSections.has(item)))
    ) {
      throw new Error("agents.include must be an array containing only: commands, safety, entrypoints, contextLinks.");
    }
    if (
      agents.manualSources !== undefined &&
      (!Array.isArray(agents.manualSources) || agents.manualSources.some((item) => typeof item !== "string" || item.trim() === ""))
    ) {
      throw new Error("agents.manualSources must be an array of non-empty strings.");
    }
  }
  void source;
}

function validateFeedbackConfig(config: ContextFeedbackConfig): void {
  if (
    typeof config.enabled !== "boolean" ||
    typeof config.telemetry !== "boolean" ||
    typeof config.network !== "boolean" ||
    typeof config.useLocalQualitySignals !== "boolean"
  ) {
    throw new Error("feedback switches must be boolean.");
  }
  if (config.endpoint !== undefined) validateFeedbackEndpoint(config.endpoint);
  if (config.network && !config.endpoint) throw new Error("feedback.endpoint is required when feedback.network is true.");
}

function validateRawFeedbackConfig(input: unknown): void {
  const feedback = objectValue(input, "feedback");
  for (const field of ["enabled", "telemetry", "network", "useLocalQualitySignals"]) {
    if (feedback[field] !== undefined && typeof feedback[field] !== "boolean") throw new Error("feedback." + field + " must be boolean.");
  }
  if (feedback.endpoint !== undefined) {
    if (typeof feedback.endpoint !== "string" || !feedback.endpoint.trim()) throw new Error("feedback.endpoint must be a non-empty URL.");
    validateFeedbackEndpoint(feedback.endpoint);
  }
  const allowed = new Set(["enabled", "telemetry", "network", "useLocalQualitySignals", "endpoint"]);
  for (const key of Object.keys(feedback)) if (!allowed.has(key)) throw new Error("Unknown feedback option: " + key + ".");
  if (feedback.network === true && feedback.endpoint === undefined) throw new Error("feedback.endpoint is required when feedback.network is true.");
}

function validateFeedbackEndpoint(value: string): void {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("must use an HTTP(S) URL without credentials");
  } catch (error) {
    throw new Error("feedback.endpoint " + (error instanceof Error ? error.message : "must be a valid URL") + ".");
  }
}

function validateContextSourceConfig(input: unknown, index: number): void {
  const source = objectValue(input, `contextRegistry.sources[${index}]`);
  for (const field of ["name", "kind", "location", "trustLevel"]) {
    if (typeof source[field] !== "string" || !source[field].trim()) {
      throw new Error(`contextRegistry.sources[${index}].${field} must be a non-empty string.`);
    }
  }
  if (!["local", "remote", "bundled"].includes(source.kind as string)) {
    throw new Error(`Invalid contextRegistry.sources[${index}].kind "${String(source.kind)}".`);
  }
  if (!["official", "maintainer", "community", "private", "untrusted"].includes(source.trustLevel as string)) {
    throw new Error(`Invalid contextRegistry.sources[${index}].trustLevel "${String(source.trustLevel)}".`);
  }
  if (source.enabled !== undefined && typeof source.enabled !== "boolean") {
    throw new Error(`contextRegistry.sources[${index}].enabled must be boolean.`);
  }
  for (const field of ["timeoutMs", "maxBytes", "cacheTtlMs"]) {
    if (source[field] !== undefined && (typeof source[field] !== "number" || !Number.isFinite(source[field]) || source[field] <= 0)) {
      throw new Error(`contextRegistry.sources[${index}].${field} must be a positive number.`);
    }
  }
  if (source.sha256 !== undefined && (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(source.sha256))) {
    throw new Error(`contextRegistry.sources[${index}].sha256 must be a SHA-256 hex digest.`);
  }
}

function normalizeTokenizerConfig(input: Record<string, unknown>): Partial<OpenCodePlusplusConfig["tokenizer"]> {
  return stripUndefined({
    mode: typeof input.mode === "string" ? (input.mode as TokenizerMode) : undefined,
    model: typeof input.model === "string" ? input.model : undefined
  });
}

function normalizeAgentsConfig(input: Record<string, unknown>): Partial<OpenCodePlusplusConfig["agents"]> {
  return stripUndefined({
    mode: typeof input.mode === "string" ? (input.mode as AgentsMode) : undefined,
    maxTokens: typeof input.maxTokens === "number" ? input.maxTokens : undefined,
    include: toAgentsSectionArray(input.include),
    manualSources: toStringArray(input.manualSources)
  });
}

function toAgentsSectionArray(value: unknown): AgentsSection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is AgentsSection => typeof item === "string") as AgentsSection[];
}

function validateBooleanObject(value: unknown, name: string, allowedKeys: Set<string>): void {
  if (value === undefined) return;
  const record = objectValue(value, name);
  for (const [key, item] of Object.entries(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown ${name} option: ${key}.`);
    }
    if (typeof item !== "boolean") {
      throw new Error(`${name}.${key} must be boolean.`);
    }
  }
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
