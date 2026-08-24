import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { cleanupAtomicTempFiles, cleanupStaleLock } from "../src/core/file-lock.js";
import { appendJsonLineLocked, readJsonDiagnostic, RevisionConflictError, writeJsonAtomic, writeJsonAtomicWithRevision } from "../src/core/atomic-store.js";
import { readExecutionTrace, startExecutionTrace } from "../src/harness/observability/execution-trace.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("atomic write failure leaves the previous JSON readable", () => {
  const root = createRoot();
  const filePath = path.join(root, "state.json");
  writeJsonAtomic(filePath, { value: "old" });
  assert.throws(
    () =>
      writeJsonAtomic(
        filePath,
        { value: "new" },
        {
          beforeRename: () => {
            throw new Error("simulated interruption");
          }
        }
      ),
    /simulated interruption/
  );
  assert.deepEqual(readJsonDiagnostic<{ value: string }>(filePath), { status: "ok", value: { value: "old" } });
  assert.equal(
    readdirSync(root).some((entry) => entry.includes(".tmp-")),
    false
  );
});

test("revision conflicts are detected instead of silently overwriting", () => {
  const root = createRoot();
  const filePath = path.join(root, "state.json");
  writeJsonAtomicWithRevision(filePath, { schemaVersion: 1, revision: 0, value: "first" }, 0);
  assert.throws(
    () => writeJsonAtomicWithRevision(filePath, { schemaVersion: 1, revision: 1, value: "stale" }, 0),
    (error: unknown) => error instanceof RevisionConflictError && error.actualRevision === 1
  );
});

test("corrupt JSON produces an explicit diagnostic", () => {
  const root = createRoot();
  const filePath = path.join(root, "broken.json");
  writeFileSync(filePath, "{broken", "utf8");
  const result = readJsonDiagnostic(filePath);
  assert.equal(result.status, "corrupt");
  if (result.status === "corrupt") assert.match(result.error, /Unexpected|expected|JSON/i);
});

test("concurrent trace appends retain every step", async () => {
  const root = createRoot();
  const trace = startExecutionTrace(root, "concurrent trace");
  const workerPath = path.join(root, "append-worker.mjs");
  const traceModule = pathToFileURL(path.resolve("src/harness/observability/execution-trace.ts")).href;
  writeFileSync(
    workerPath,
    `import { appendExecutionTraceStep } from ${JSON.stringify(traceModule)};\nconst [root, traceId, prefix] = process.argv.slice(2);\nfor (let index = 0; index < 10; index += 1) appendExecutionTraceStep(root, traceId, { action: prefix + index, result: "passed" });\n`,
    "utf8"
  );
  await Promise.all([runAppendWorker(workerPath, root, trace.id, "a-"), runAppendWorker(workerPath, root, trace.id, "b-")]);
  const finalTrace = readExecutionTrace(root, trace.id);
  assert.equal(finalTrace?.steps.length, 21);
  assert.equal(new Set(finalTrace?.steps.map((step) => step.id)).size, 21);
});

test("concurrent Desktop event appends retain every event and sequence", async () => {
  const root = createRoot();
  const eventLog = path.join(root, "目录 with spaces", "events.jsonl");
  const workerPath = path.join(root, "append-event-worker.mjs");
  const storeModule = pathToFileURL(path.resolve("src/core/atomic-store.ts")).href;
  writeFileSync(
    workerPath,
    `import { appendJsonLineLocked } from ${JSON.stringify(storeModule)};\nconst [eventLog, prefix] = process.argv.slice(2);\nfor (let index = 0; index < 10; index += 1) appendJsonLineLocked(eventLog, { eventId: prefix + index, sequence: 0, payload: prefix });\n`,
    "utf8"
  );

  await Promise.all([runJsonLineWorker(workerPath, eventLog, "a-"), runJsonLineWorker(workerPath, eventLog, "b-")]);

  const events = readFileSync(eventLog, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as { eventId: string; sequence: number });
  assert.equal(events.length, 20);
  assert.equal(new Set(events.map((event) => event.eventId)).size, 20);
  assert.deepEqual(
    events.map((event) => event.sequence).sort((left, right) => left - right),
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
});

test("Windows-style nested paths and temporary files are handled safely", () => {
  const root = path.join(createRoot(), "目录 with spaces");
  const filePath = path.join(root, "nested", "windows-style.json");
  writeJsonAtomic(filePath, { ok: true });
  writeJsonAtomic(filePath, { ok: "updated" }, { renameRetries: 2, renameRetryMs: 1 });
  assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { ok: "updated" });
  assert.deepEqual(readJsonDiagnostic(filePath).status, "ok");
});

test("stale lock cleanup removes dead-owner locks but preserves live-owner locks", () => {
  const root = createRoot();
  const deadLock = path.join(root, "dead.json.lock");
  writeFileSync(deadLock, JSON.stringify({ schemaVersion: 1, pid: 999999999, ownerToken: "dead", createdAt: "2020-01-01T00:00:00.000Z" }), "utf8");
  const old = new Date(Date.now() - 300_000);
  utimesSync(deadLock, old, old);
  assert.equal(cleanupStaleLock(deadLock, 1000), true);
  assert.equal(existsSync(deadLock), false);

  const liveLock = path.join(root, "live.json.lock");
  writeFileSync(liveLock, JSON.stringify({ schemaVersion: 1, pid: process.pid, ownerToken: "live", createdAt: new Date().toISOString() }), "utf8");
  utimesSync(liveLock, old, old);
  assert.equal(cleanupStaleLock(liveLock, 1000), false);
  assert.equal(existsSync(liveLock), true);
});

test("locked JSONL append assigns sequence and deduplicates event IDs", () => {
  const root = createRoot();
  const filePath = path.join(root, "events.jsonl");
  assert.deepEqual(appendJsonLineLocked(filePath, { eventId: "event-a", payload: "first" }), { appended: true, sequence: 1 });
  assert.deepEqual(appendJsonLineLocked(filePath, { eventId: "event-a", payload: "duplicate" }), { appended: false, sequence: 1 });
  assert.deepEqual(appendJsonLineLocked(filePath, { eventId: "event-b", payload: "second" }), { appended: true, sequence: 2 });
  assert.equal(readFileSync(filePath, "utf8").trim().split(/\r?\n/).length, 2);
});

test("temporary cleanup preserves active files and removes stale files", () => {
  const root = createRoot();
  const target = path.join(root, "state.json");
  const active = `${target}.tmp-active`;
  const stale = `${target}.tmp-stale`;
  writeFileSync(active, "active", "utf8");
  writeFileSync(stale, "stale", "utf8");
  const old = new Date(Date.now() - 300_000);
  utimesSync(stale, old, old);
  cleanupAtomicTempFiles(target, 1000);
  assert.equal(existsSync(active), true);
  assert.equal(existsSync(stale), false);
});

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-atomic-"));
  temporaryRoots.push(root);
  return root;
}

function runAppendWorker(workerPath: string, root: string, traceId: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath, root, traceId, prefix], { stdio: "pipe" });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Trace append worker exited ${code}: ${stderr}`))));
  });
}

function runJsonLineWorker(workerPath: string, eventLog: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath, eventLog, prefix], { stdio: "pipe" });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Event append worker exited ${code}: ${stderr}`))));
  });
}
