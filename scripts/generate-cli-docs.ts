import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import prettier from "prettier";
import { createCliProgram } from "../src/cli/program.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE_PATH = path.join(ROOT, "docs", "reference", "cli-reference.md");
const SNAPSHOT_PATH = path.join(ROOT, "docs", "reference", "cli-help-snapshot.md");

const check = process.argv.includes("--check");
const program = createCliProgram("opencode-plusplus");
const commands = flattenCommands(program);
const reference = await formatMarkdown(renderCliReference(program, commands));
const snapshot = await formatMarkdown(renderHelpSnapshot(program, commands));

if (check) {
  assertUnchanged(REFERENCE_PATH, reference);
  assertUnchanged(SNAPSHOT_PATH, snapshot);
} else {
  writeFileSync(REFERENCE_PATH, reference, "utf8");
  writeFileSync(SNAPSHOT_PATH, snapshot, "utf8");
}

function flattenCommands(root: Command): Command[] {
  const result: Command[] = [];
  const visit = (command: Command): void => {
    for (const child of command.commands) {
      if (isHidden(child)) continue;
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function renderCliReference(root: Command, commands: Command[]): string {
  return `${generatedHeader("CLI Reference")}

## Recommended Commands

\`opencode-plusplus\` is the advanced CLI entrypoint for diagnostics, repository context, and batch Harness workflows. Daily interactive coding happens in the official OpenCode Desktop application:

\`\`\`bash
opencode-plusplus status .
opencode-plusplus doctor .
opencode-plusplus oc run "task" .
opencode-plusplus oc report --last
\`\`\`

The same binary also exposes advanced / kernel commands for scriptable context, verification, and harness workflows:

\`\`\`bash
opencode-plusplus build .
opencode-plusplus verify --diff .
opencode-plusplus orchestrate "task" .
\`\`\`

## Command Index

| Command | Description |
| --- | --- |
${commands.map((command) => `| \`${fullName(command)}\` | ${escapeTable(command.description() || "")} |`).join("\n")}

## Sidecar Evidence Note

\`opencode-plusplus sidecar record-tool\` is an internal post-execution evidence recorder used by the OpenCode sidecar \`tool.execute.after\` hook. The current global plugin calls the shared service in-process, so long stdout/stderr is never passed through command-line arguments. It writes \`.agent-context/traces/opencode-sidecar-events.jsonl\`, \`.agent-context/traces/tool-evidence/opencode-tool-*.json\`, and \`.agent-context/traces/opencode-session-<id>.json\` with command, exit code when available, timestamps, stdout/stderr hashes, sanitized/truncated output previews, working-tree hashes, and touched files. Missing exit code is recorded as \`unknown\`, not success.

## Generated Help

${[root, ...commands].map(renderCommandHelp).join("\n\n")}
`;
}

function renderHelpSnapshot(root: Command, commands: Command[]): string {
  return `${generatedHeader("CLI Help Snapshot")}

This file stores the complete generated Commander help output used by CI to detect CLI documentation drift.

${[root, ...commands].map(renderCommandHelp).join("\n\n")}
`;
}

function renderCommandHelp(command: Command): string {
  return `### \`${fullName(command)}\`

\`\`\`txt
${command.helpInformation().trimEnd()}
\`\`\``;
}

function fullName(command: Command): string {
  const names: string[] = [];
  let current: Command | undefined = command;
  while (current) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(" ");
}

function generatedHeader(title: string): string {
  return `# ${title}

<!-- generated-by: opencode-plusplus docs:cli -->
<!-- do-not-edit: run npm run docs:cli -->
`;
}

function isHidden(command: Command): boolean {
  return Boolean((command as unknown as { _hidden?: boolean })._hidden);
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function assertUnchanged(file: string, expected: string): void {
  let actual = "";
  try {
    actual = readFileSync(file, "utf8");
  } catch {
    throw new Error(`${relative(file)} is missing. Run npm run docs:cli.`);
  }
  if (actual !== expected) {
    throw new Error(`${relative(file)} is out of date. Run npm run docs:cli and commit the result.`);
  }
}

function relative(file: string): string {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

async function formatMarkdown(markdown: string): Promise<string> {
  return prettier.format(markdown, { parser: "markdown" });
}
