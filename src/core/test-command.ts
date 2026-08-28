const TEST_SELECTOR_PATTERN = /(?:^|[;&|]\s*)(?:opencode-plusplus(?:\.cmd|\.exe)?|node\s+\S*dist[\\/]cli[\\/]index\.js)\s+tests(?:\s|$)/i;

const TEST_EXECUTION_PATTERNS = [
  /(?:^|[;&|]\s*)npm(?:\.cmd)?\s+(?:run\s+)?test(?::[\w.-]+)?(?:\s|$)/i,
  /(?:^|[;&|]\s*)pnpm(?:\.cmd)?\s+(?:run\s+)?test(?::[\w.-]+)?(?:\s|$)/i,
  /(?:^|[;&|]\s*)yarn(?:\.cmd)?\s+(?:run\s+)?test(?::[\w.-]+)?(?:\s|$)/i,
  /(?:^|[;&|]\s*)bun(?:\.exe)?\s+(?:run\s+)?test(?::[\w.-]+)?(?:\s|$)/i,
  /(?:^|[;&|]\s*)(?:npx\s+|pnpm\s+exec\s+|yarn\s+exec\s+|bunx\s+)?(?:vitest|jest)(?:\s|$)/i,
  /(?:^|[;&|]\s*)(?:python(?:\.exe)?\s+-m\s+)?pytest(?:\s|$)/i,
  /(?:^|[;&|]\s*)node(?:\.exe)?\s+--test(?:\s|$)/i,
  /(?:^|[;&|]\s*)(?:tsx|ts-node)(?:\.cmd)?\s+--test(?:\s|$)/i,
  /(?:^|[;&|]\s*)go(?:\.exe)?\s+test(?:\s|$)/i,
  /(?:^|[;&|]\s*)cargo(?:\.exe)?\s+test(?:\s|$)/i,
  /(?:^|[;&|]\s*)dotnet(?:\.exe)?\s+test(?:\s|$)/i,
  /(?:^|[;&|]\s*)(?:mvnw?|gradlew?)(?:\.cmd|\.bat)?(?:\s+\S+)*\s+test(?:\s|$)/i
];

export function isTestSelectorCommand(command: string): boolean {
  return TEST_SELECTOR_PATTERN.test(command.trim());
}

export function isTestExecutionCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized || isTestSelectorCommand(normalized)) return false;
  return TEST_EXECUTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function firstTestExecutionCommand(commands: string[]): string | undefined {
  return commands.find(isTestExecutionCommand);
}
