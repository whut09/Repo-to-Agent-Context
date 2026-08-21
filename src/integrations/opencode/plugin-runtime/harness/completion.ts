export function isFinalizeAction(action: string, blocking: boolean, missingEvidence: string[] = [], requiredCommands: string[] = []): boolean {
  return action === "finalize" && !blocking && missingEvidence.length === 0 && requiredCommands.length === 0;
}

export function completionRuleFor(action: string, blocking: boolean, missingEvidence: string[] = [], requiredCommands: string[] = []): string {
  return isFinalizeAction(action, blocking, missingEvidence, requiredCommands)
    ? "decision=finalize with all required evidence satisfied. You may report the work complete."
    : "不得声称任务完成。Required evidence, tests, and nextAction must be satisfied after the latest edit.";
}
