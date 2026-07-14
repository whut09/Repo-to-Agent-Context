import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { AgentTarget, AgentsMode, AgentsSection, EvidencePolicyMode, OpenCodePlusplusConfig, TokenizerMode } from "../core/types.js";

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

export function validateConfig(config: OpenCodePlusplusConfig): void {
  if (!["opencode", "codex", "claude", "cursor", "all"].includes(config.target)) {
    throw new Error(`Invalid target "${config.target}". Expected one of: opencode, codex, claude, cursor, all.`);
  }
  if (!["advisory", "balanced", "strict"].includes(config.evidencePolicy)) {
    throw new Error(`Invalid evidencePolicy "${config.evidencePolicy}". Expected one of: advisory, balanced, strict.`);
  }
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
