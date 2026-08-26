import assert from "node:assert/strict";
import test from "node:test";
import { contextToolError, invalidArguments } from "../src/application/context-tool-errors.js";

test("Context tool errors classify expected local and network failures", () => {
  assert.equal(contextToolError(new Error("file must be a normalized relative path")).code, "INVALID_PATH");
  assert.equal(contextToolError(new Error("Context entry was not found: official/missing")).code, "ENTRY_NOT_FOUND");
  assert.equal(contextToolError(new Error("Context source is not configured for entry")).code, "SOURCE_NOT_FOUND");
  assert.equal(contextToolError(new Error("remote fetch timeout")).code, "NETWORK_FAILURE");
  assert.equal(contextToolError(new Error("Invalid Context registry schemaVersion")).code, "REGISTRY_INVALID");
  assert.equal(contextToolError(new Error("Unable to read corrupt feedback store")).code, "STATE_CORRUPT");
});

test("invalid argument diagnostics are stable and deduplicated", () => {
  assert.deepEqual(invalidArguments("Malformed input.", ["entryId required", "entryId required"]), {
    code: "INVALID_ARGUMENTS",
    message: "Malformed input.",
    details: ["entryId required"],
    retryable: false
  });
});
