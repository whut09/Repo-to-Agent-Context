import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContextPackage } from "../src/core/context-builder.js";
import type { ContextPackage } from "../src/core/types.js";
import {
  combineContextRefreshMetrics,
  refreshHarnessContext,
  type ContextBuilder,
  type ContextRefreshMetrics
} from "../src/harness/control-plane/context-refresh.js";
import { writeContextPackage } from "../src/outputs/renderers/writer.js";

test("run-tests reuses context when the executor did not modify files", async () => {
  await withContextRepo(async ({ root, context }) => {
    let buildCount = 0;
    const result = await refreshHarnessContext(
      {
        root,
        context,
        previousDecisionAction: "run-tests",
        contextWorkingTreeHash: "unchanged",
        currentWorkingTreeHash: "unchanged",
        modifiedFiles: []
      },
      countingBuilder(context, () => {
        buildCount += 1;
      })
    );

    assert.equal(result.context, context);
    assert.equal(result.metrics.mode, "reused");
    assert.equal(result.metrics.cacheHit, true);
    assert.equal(result.metrics.buildCount, 0);
    assert.equal(buildCount, 0);
  });
});

test("repair source edits use the incremental context cache", async () => {
  await withContextRepo(async ({ root, context }) => {
    const cacheOptions: Array<boolean | undefined> = [];
    const result = await refreshHarnessContext(
      {
        root,
        context,
        previousDecisionAction: "repair",
        contextWorkingTreeHash: "before",
        currentWorkingTreeHash: "after",
        modifiedFiles: ["src/a.ts"]
      },
      async (_root, options) => {
        cacheOptions.push(options?.cache);
        return context;
      }
    );

    assert.equal(result.metrics.mode, "incremental");
    assert.equal(result.metrics.buildCount, 1);
    assert.deepEqual(cacheOptions, [true]);
  });
});

test("repack forces a full context rebuild", async () => {
  await withContextRepo(async ({ root, context }) => {
    const cacheOptions: Array<boolean | undefined> = [];
    const result = await refreshHarnessContext(
      {
        root,
        context,
        previousDecisionAction: "repack",
        contextWorkingTreeHash: "same",
        currentWorkingTreeHash: "same",
        modifiedFiles: []
      },
      async (_root, options) => {
        cacheOptions.push(options?.cache);
        return context;
      }
    );

    assert.equal(result.metrics.mode, "rebuilt");
    assert.equal(result.metrics.cacheMiss, true);
    assert.deepEqual(cacheOptions, [false]);
  });
});

test("dependency and project configuration edits invalidate context caches", async () => {
  await withContextRepo(async ({ root, context }) => {
    for (const modifiedFile of ["package.json", "tsconfig.json", "config/opencode-plusplus.config.yml"]) {
      const cacheOptions: Array<boolean | undefined> = [];
      const result = await refreshHarnessContext(
        {
          root,
          context,
          previousDecisionAction: "repair",
          contextWorkingTreeHash: "before",
          currentWorkingTreeHash: `after:${modifiedFile}`,
          modifiedFiles: [modifiedFile]
        },
        async (_root, options) => {
          cacheOptions.push(options?.cache);
          return context;
        }
      );

      assert.equal(result.metrics.mode, "rebuilt", modifiedFile);
      assert.deepEqual(cacheOptions, [false], modifiedFile);
    }
  });
});

test("missing modification details do not hide a changed working tree", async () => {
  await withContextRepo(async ({ root, context }) => {
    const cacheOptions: Array<boolean | undefined> = [];
    const result = await refreshHarnessContext(
      {
        root,
        context,
        previousDecisionAction: "repair",
        contextWorkingTreeHash: "before",
        currentWorkingTreeHash: "after"
      },
      async (_root, options) => {
        cacheOptions.push(options?.cache);
        return context;
      }
    );

    assert.equal(result.metrics.mode, "incremental");
    assert.deepEqual(cacheOptions, [true]);
  });
});

test("incremental refresh is semantically equivalent to a forced full rebuild", async () => {
  await withContextRepo(async ({ root }) => {
    writeFileSync(path.join(root, "src", "a.ts"), "export const a = 2;\n", "utf8");

    const incremental = await buildContextPackage(root, { cache: true });
    const rebuilt = await buildContextPackage(root, { cache: false });

    assert.deepEqual(withoutCacheStats(incremental), withoutCacheStats(rebuilt));
    assert.ok(incremental.cacheStats.indexHits > 0);
    assert.equal(rebuilt.cacheStats.enabled, false);
  });
});

test("multi-loop context refresh records fewer builds than unconditional rebuilding", async () => {
  await withContextRepo(async ({ root, context }) => {
    let builderCalls = 0;
    const builder = countingBuilder(context, () => {
      builderCalls += 1;
    });
    const metrics: ContextRefreshMetrics[] = [];

    metrics.push(
      (
        await refreshHarnessContext(
          {
            root,
            context,
            previousDecisionAction: "repair",
            contextWorkingTreeHash: "tree-1",
            currentWorkingTreeHash: "tree-2",
            modifiedFiles: ["src/a.ts"]
          },
          builder
        )
      ).metrics
    );
    metrics.push(
      (
        await refreshHarnessContext(
          {
            root,
            context,
            previousDecisionAction: "run-tests",
            contextWorkingTreeHash: "tree-2",
            currentWorkingTreeHash: "tree-2",
            modifiedFiles: []
          },
          builder
        )
      ).metrics
    );
    metrics.push(
      (
        await refreshHarnessContext(
          {
            root,
            context,
            previousDecisionAction: "run-tests",
            contextWorkingTreeHash: "tree-2",
            currentWorkingTreeHash: "tree-2",
            modifiedFiles: []
          },
          builder
        )
      ).metrics
    );

    const total = metrics.reduce(combineContextRefreshMetrics);
    assert.equal(builderCalls, 1);
    assert.equal(total.buildCount, 1);
    assert.ok(total.buildCount < metrics.length);
    assert.ok(total.durationMs >= 0);
    assert.deepEqual(
      metrics.map((metric) => metric.mode),
      ["incremental", "reused", "reused"]
    );
  });
});

function countingBuilder(context: ContextPackage, onBuild: () => void): ContextBuilder {
  return async () => {
    onBuild();
    return context;
  };
}

function withoutCacheStats(context: ContextPackage): Omit<ContextPackage, "cacheStats"> {
  const { cacheStats: _cacheStats, ...semanticContext } = context;
  return semanticContext;
}

async function withContextRepo(run: (input: { root: string; context: ContextPackage }) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-plusplus-context-refresh-"));
  try {
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`, "utf8");
    writeFileSync(path.join(root, "tsconfig.json"), `${JSON.stringify({ compilerOptions: { module: "NodeNext" } }, null, 2)}\n`, "utf8");
    writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    writeFileSync(path.join(root, "src", "b.ts"), "import { a } from './a.js';\nexport const b = a;\n", "utf8");
    const context = await buildContextPackage(root);
    writeContextPackage(context);
    await run({ root, context });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
