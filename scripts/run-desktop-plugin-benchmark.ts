import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "../src/core/atomic-store.js";
import { renderDesktopPluginBenchmark, runDesktopPluginBenchmark } from "../src/benchmarks/desktop-plugin-benchmark.js";

const outputDirectory = path.resolve(valueAfter("--output-dir") ?? path.join("benchmarks", "results", "desktop"));
const result = await runDesktopPluginBenchmark();
const markdown = `${renderDesktopPluginBenchmark(result)}\n`;
writeJsonAtomic(path.join(outputDirectory, "result.json"), result);
writeTextAtomic(path.join(outputDirectory, "result.md"), markdown);
process.stdout.write(markdown);
if (!result.passed) process.exitCode = 1;

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
