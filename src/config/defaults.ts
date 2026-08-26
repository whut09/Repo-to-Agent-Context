import type { OpenCodePlusplusConfig } from "../core/types.js";

export const DEFAULT_EXCLUDES = [
  ".git/**",
  ".agent-context/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".next/**",
  ".nuxt/**",
  ".svelte-kit/**",
  ".turbo/**",
  ".cache/**",
  ".venv/**",
  "venv/**",
  "__pycache__/**",
  "target/**",
  "vendor/**",
  "*.min.js",
  "*.map"
];

export const DEFAULT_CONFIG: OpenCodePlusplusConfig = {
  target: "opencode",
  evidencePolicy: "advisory",
  contextRegistry: {
    enabled: false,
    offline: true,
    sources: []
  },
  feedback: {
    enabled: true,
    telemetry: false,
    network: false,
    useLocalQualitySignals: false
  },
  tokenBudget: 60000,
  include: ["**/*"],
  exclude: DEFAULT_EXCLUDES,
  llm: {
    enabled: false,
    provider: "openai-compatible",
    baseUrl: "xx",
    apiKey: "xx",
    model: "xx",
    temperature: 0.2,
    maxTokens: 1200
  },
  rag: {
    provider: "lightrag",
    chunkTokenLimit: 900
  },
  tokenizer: {
    mode: "chars_approx",
    model: undefined
  },
  agents: {
    mode: "minimal",
    maxTokens: 1200,
    include: ["commands", "safety", "entrypoints", "contextLinks"],
    manualSources: ["AGENTS.manual.md"]
  },
  outputs: {
    agents: true,
    modules: true,
    graph: true,
    tasks: true,
    readiness: true,
    rag: true
  }
};
