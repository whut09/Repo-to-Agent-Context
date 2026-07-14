export function starterConfig(): string {
  return `target: opencode
evidencePolicy: advisory
tokenBudget: 60000

include:
  - "**/*"

exclude:
  - node_modules/**
  - dist/**
  - build/**
  - coverage/**
  - .next/**
  - .venv/**

tokenizer:
  mode: chars_approx
  # mode: cl100k_base
  # model: gpt-4.1

agents:
  mode: minimal
  maxTokens: 1200
  manualSources:
    - AGENTS.manual.md
  include:
    - commands
    - safety
    - entrypoints
    - contextLinks

outputs:
  agents: true
  modules: true
  graph: true
  tasks: true
  readiness: true
  rag: true
`;
}
