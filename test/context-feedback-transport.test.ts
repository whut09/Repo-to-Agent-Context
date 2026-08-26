import assert from "node:assert/strict";
import test from "node:test";
import { createContextFeedback } from "../src/context-registry/feedback.js";
import { submitContextFeedback } from "../src/context-registry/feedback-transport.js";

const feedback = createContextFeedback({
  repository: "C:/work/project",
  entryId: "official/payments",
  source: "official",
  version: "2.0.0",
  revision: 1,
  target: "entry",
  label: "useful"
});

test("feedback transport is offline by default and does not call fetch", async () => {
  let calls = 0;
  const result = await submitContextFeedback(
    feedback,
    { enabled: true, telemetry: false, network: false, useLocalQualitySignals: false },
    {
      fetcher: async () => {
        calls += 1;
        throw new Error("must not call");
      }
    }
  );
  assert.equal(result.status, "disabled");
  assert.equal(calls, 0);
});

test("feedback transport sends only explicit safe metadata", async () => {
  let body = "";
  const result = await submitContextFeedback(
    feedback,
    { enabled: true, telemetry: true, network: true, useLocalQualitySignals: false, endpoint: "https://feedback.example.test/v1" },
    {
      fetcher: async (_input, init) => {
        body = String(init?.body);
        return new Response(null, { status: 204 });
      }
    }
  );
  assert.equal(result.status, "sent");
  const payload = JSON.parse(body) as Record<string, unknown>;
  assert.equal(payload.entryId, "official/payments");
  assert.equal("task" in payload, false);
  assert.equal("content" in payload, false);
  assert.equal("repository" in payload, false);
});

test("network failure is returned without throwing", async () => {
  const result = await submitContextFeedback(
    feedback,
    { enabled: true, telemetry: true, network: true, useLocalQualitySignals: false, endpoint: "https://feedback.example.test/v1" },
    {
      fetcher: async () => {
        throw new Error("offline");
      }
    }
  );
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /offline/);
});
