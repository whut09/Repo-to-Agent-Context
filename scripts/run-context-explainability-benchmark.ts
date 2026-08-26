import path from "node:path";
import { mkdirSync } from "node:fs";
import { writeJsonAtomic, writeTextAtomic } from "../src/core/atomic-store.js";
import { renderContextExplainabilityBenchmark, runContextExplainabilityBenchmark } from "../src/benchmarks/context-explainability.js";

const outputDirectory = path.resolve(valueAfter("--output-dir") ?? path.join("benchmarks", "results", "context-explainability"));
const benchmarkDir = path.resolve(valueAfter("--benchmark-dir") ?? "benchmarks");
const topK = Number.parseInt(valueAfter("--top-k") ?? "8", 10);
if (!Number.isInteger(topK) || topK <= 0) throw new Error("--top-k must be a positive integer.");

const result = await runContextExplainabilityBenchmark({ benchmarkDir, topK });
const markdown = `${renderContextExplainabilityBenchmark(result)}\n`;
mkdirSync(outputDirectory, { recursive: true });
writeJsonAtomic(path.join(outputDirectory, "result.json"), result);
writeTextAtomic(path.join(outputDirectory, "result.md"), markdown);
process.stdout.write(markdown);

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
