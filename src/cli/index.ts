#!/usr/bin/env node
// Internal dev/test surface. Not the product entry point: end users install the
// Desktop plugin from the release EXE. This CLI stays for CI, repository context
// generation, diagnostics, and the harness-led loops used by the plugin runtime.
import { runCli } from "./program.js";

await runCli();
