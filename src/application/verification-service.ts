import type { EvidencePolicyMode } from "../core/types.js";
import { buildApplicationContext } from "./context-service.js";
import { buildChangeImpactReport, renderChangeImpactReport } from "../outputs/impact.js";
import { renderTaskVerify } from "../outputs/task-harness.js";
import { buildTestSelection, renderTestSelection } from "../outputs/test-selector.js";
import { buildPolicyReport, type PolicyFailOn } from "../harness/verification-plane/policy-engine.js";

export async function testApplicationChanges(input: { repo: string; forPaths?: string[]; diff?: boolean; base?: string }) {
  const context = await buildApplicationContext(input.repo);
  const options = { forPaths: input.forPaths, diff: input.diff, base: input.base ?? "main" };
  return { context, markdown: renderTestSelection(context, options), ...buildTestSelection(context, options) };
}

export async function inspectApplicationImpact(input: { repo: string; base?: string }) {
  const context = await buildApplicationContext(input.repo);
  const options = { base: input.base ?? "main" };
  return { context, markdown: renderChangeImpactReport(context, options), report: buildChangeImpactReport(context, options) };
}

export async function verifyApplicationChanges(input: { repo: string; base?: string; diff?: boolean }) {
  const context = await buildApplicationContext(input.repo);
  return { context, markdown: renderTaskVerify(context, { base: input.base ?? "main", diff: input.diff ?? true }) };
}

export async function evaluateApplicationPolicy(input: {
  repo: string;
  base?: string;
  traceId?: string;
  failOn?: PolicyFailOn;
  evidencePolicy?: EvidencePolicyMode;
}) {
  const context = await buildApplicationContext(input.repo);
  return {
    context,
    report: buildPolicyReport(context, {
      base: input.base ?? "main",
      traceId: input.traceId,
      failOn: input.failOn,
      evidencePolicy: input.evidencePolicy
    })
  };
}
