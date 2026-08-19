import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PLUSPLUS_SKILL,
  PLUSPLUS_SKILL_FILE,
  PLUSPLUS_TASK_COMMAND,
  PLUSPLUS_TASK_COMMAND_FILE,
  PLUSPLUS_VERIFY_COMMAND,
  PLUSPLUS_VERIFY_COMMAND_FILE
} from "../src/installer/opencode-plusplus-prompts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installer: C# installer mirrors the TS prompt content exactly", () => {
  const cs = readFileSync(path.join(root, "src/installer", "windows-installer.cs"), "utf8");

  assertCSharpConstant(cs, "PlusPlusTaskCommand", PLUSPLUS_TASK_COMMAND);
  assertCSharpConstant(cs, "PlusPlusVerifyCommand", PLUSPLUS_VERIFY_COMMAND);
  assertCSharpConstant(cs, "PlusPlusSkill", PLUSPLUS_SKILL);
});

test("installer: C# installer uses the same command and skill file names as TS", () => {
  const cs = readFileSync(path.join(root, "src/installer", "windows-installer.cs"), "utf8");

  assert.ok(cs.includes(`private const string PlusPlusTaskCommandFile = "${PLUSPLUS_TASK_COMMAND_FILE}";`), "C# must define PlusPlusTaskCommandFile");
  assert.ok(cs.includes(`private const string PlusPlusVerifyCommandFile = "${PLUSPLUS_VERIFY_COMMAND_FILE}";`), "C# must define PlusPlusVerifyCommandFile");
  assert.ok(cs.includes(`private const string PlusPlusSkillFile = "${PLUSPLUS_SKILL_FILE}";`), "C# must define PlusPlusSkillFile");
  assert.ok(cs.includes(`Path.Combine(root, "commands", PlusPlusTaskCommandFile)`), "C# must install the plusplus-task command");
  assert.ok(cs.includes(`Path.Combine(root, "commands", PlusPlusVerifyCommandFile)`), "C# must install the plusplus-verify command");
  assert.ok(cs.includes(`skillFile = Path.Combine(root, "skills", "opencode-plusplus", "SKILL.md")`), "C# must install the skill at the same path as TS");
});

test("installer: prompt content stays free of CLI invocation text", () => {
  for (const content of [PLUSPLUS_TASK_COMMAND, PLUSPLUS_VERIFY_COMMAND, PLUSPLUS_SKILL]) {
    assert.doesNotMatch(content, /opencode-plusplus oc\b/, "prompt must not reference the opencode-plusplus oc CLI command");
    assert.doesNotMatch(
      content,
      /opencode-plusplus (build|verify|policy|orchestrate|doctor|report|trace|context|status)\b/,
      "prompt must not reference the opencode-plusplus CLI"
    );
  }
  assert.match(PLUSPLUS_TASK_COMMAND, /Task: \$ARGUMENTS/, "plusplus-task must pass $ARGUMENTS through as the task");
  assert.match(PLUSPLUS_TASK_COMMAND, /opencode_plusplus_prepare/);
  assert.match(PLUSPLUS_TASK_COMMAND, /opencode_plusplus_evaluate/);
  assert.match(PLUSPLUS_TASK_COMMAND, /opencode_plusplus_next/);
  assert.match(PLUSPLUS_TASK_COMMAND, /mustInspect/);
  assert.match(PLUSPLUS_TASK_COMMAND, /allowedEditGlobs/);
  assert.match(PLUSPLUS_TASK_COMMAND, /requiredCommands/);
  assert.match(PLUSPLUS_SKILL, /^name: opencode-plusplus/m, "SKILL.md must declare the skill name");
  assert.match(PLUSPLUS_SKILL, /opencode_plusplus_retrieve/);
});

function assertCSharpConstant(source: string, name: string, expected: string): void {
  const match = source.match(new RegExp(`private const string ${name} = "((?:[^"\\\\]|\\\\.)*)";`));
  assert.ok(match, `C# installer must define const string ${name}`);
  assert.equal(unescapeCSharp(match[1]), expected, `C# ${name} drifted from src/installer/opencode-plusplus-prompts.ts`);
}

function unescapeCSharp(literal: string): string {
  let output = "";
  for (let index = 0; index < literal.length; index++) {
    const char = literal[index];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = literal[index + 1];
    assert.ok(next === "n" || next === '"' || next === "\\", `Unsupported C# escape \\${next ?? "end"} in installer prompt constant`);
    output += next === "n" ? "\n" : next;
    index++;
  }
  return output;
}
