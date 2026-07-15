import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { OPENCODE_PLUSPLUS_PACKAGE_NAME, OPENCODE_PLUSPLUS_PACKAGE_VERSION } from "../src/core/package-info.js";

test("generated package info matches the root package manifest", () => {
  const manifest = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { name: string; version: string };
  assert.equal(OPENCODE_PLUSPLUS_PACKAGE_NAME, manifest.name);
  assert.equal(OPENCODE_PLUSPLUS_PACKAGE_VERSION, manifest.version);
});
