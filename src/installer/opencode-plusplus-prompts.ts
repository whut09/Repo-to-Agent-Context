// Single source of truth for the agent-facing files the Windows installer writes
// into the user OpenCode config directory. windows-installer.cs must mirror these
// strings exactly; test/installer-prompt-sync.test.ts enforces the parity.
// Keep this content free of double quotes and backslashes so the C# literal is
// a plain \n-escaped string.

export const PLUSPLUS_TASK_COMMAND_FILE = "plusplus-task.md";
export const PLUSPLUS_VERIFY_COMMAND_FILE = "plusplus-verify.md";
export const PLUSPLUS_SKILL_FILE = "skills/opencode-plusplus/SKILL.md";

export const PLUSPLUS_TASK_COMMAND = `---
description: Run a coding task through the OpenCode++ harness workflow
---

Task: $ARGUMENTS

Run this task through the OpenCode++ harness workflow. Follow the steps in order and do not skip any of them.

1. Call the opencode_plusplus_prepare tool with task set to the task above and type set to bugfix, feature, or refactor.
2. Read every file listed in mustInspect before making edits.
3. Change only files inside allowedEditGlobs and never touch files in avoidEditGlobs.
4. Run every command in requiredCommands with the OpenCode built-in shell tool and keep its output.
5. Call the opencode_plusplus_evaluate tool with the taskId returned by prepare.
6. Call the opencode_plusplus_next tool with the same taskId.
7. If nextAction is not finalize, fix the reported findings, run the required commands, and repeat from step 4. Do not claim the task is complete until nextAction is finalize.

Never invent file paths, package scripts, or command output that did not appear in tool results or files you actually read. All verification happens through the OpenCode++ tools; do not suggest any command-line harness usage.
`;

export const PLUSPLUS_VERIFY_COMMAND = `---
description: Verify the current OpenCode++ task state
---

Verify the OpenCode++ harness state for the current task.

1. If this session has no taskId from opencode_plusplus_prepare, call opencode_plusplus_prepare for the current task first.
2. Call the opencode_plusplus_evaluate tool with that taskId.
3. Call the opencode_plusplus_next tool with the same taskId.
4. Report whether the state is blocking, list every missing evidence item, and list every required command that still must run.
5. Do not claim completion unless nextAction is finalize.

All verification happens through the OpenCode++ tools; do not suggest any command-line harness usage.
`;

export const PLUSPLUS_SKILL = `---
name: opencode-plusplus
description: Load for concrete coding tasks, cross-module changes, and final verification in a repository instrumented with OpenCode++. Do not load for pure Q&A, discussion, or non-coding chat.
---

OpenCode++ reliability harness workflow for coding tasks in the current repository.

When to use each tool:
- opencode_plusplus_prepare: call once at the start of a concrete coding task. It returns taskId, mustInspect, allowedEditGlobs, avoidEditGlobs, and requiredCommands.
- opencode_plusplus_retrieve: call to locate task-relevant files before searching blindly.
- opencode_plusplus_evaluate: call after edits, or before claiming the task is done. It returns blocking, findings, decision, and missingEvidence.
- opencode_plusplus_next: call after evaluate to get the next action for the task.

Hard rules:
- Read every mustInspect file before editing, and edit only inside allowedEditGlobs.
- Run every requiredCommands entry with the built-in shell tool before calling opencode_plusplus_evaluate.
- When opencode_plusplus_evaluate reports blocking as true, the task is not complete: fix the findings, run the required commands, and evaluate again.
- Present the task as complete only when opencode_plusplus_next returns nextAction as finalize.
- Never fabricate files, commands, or outputs that are not present in tool results.
`;

export function agentCommandFiles(): Array<{ file: string; content: string }> {
  return [
    { file: PLUSPLUS_TASK_COMMAND_FILE, content: PLUSPLUS_TASK_COMMAND },
    { file: PLUSPLUS_VERIFY_COMMAND_FILE, content: PLUSPLUS_VERIFY_COMMAND }
  ];
}
