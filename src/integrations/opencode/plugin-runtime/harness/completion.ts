const FINALIZE_ACTIONS = new Set(["ready-for-review", "finalize"]);

export function isFinalizeAction(action: string, blocking: boolean): boolean {
  return FINALIZE_ACTIONS.has(action) && !blocking;
}

export function completionRuleFor(action: string, blocking: boolean): string {
  return isFinalizeAction(action, blocking)
    ? "nextAction is finalize/ready-for-review. You may report the work as ready for review, not merged."
    : "不得声称任务完成。Follow nextAction and requiredCommands before claiming completion.";
}
