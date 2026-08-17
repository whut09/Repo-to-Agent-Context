# Generated Files and Commit Policy

OpenCode++ writes both stable repository context and local runtime evidence. These files do not all belong in git.

Default rule:

- Commit stable guidance that helps every contributor or coding agent.
- Do not commit local traces, sidecar reports, tool evidence, caches, or machine-specific config.
- Treat execution evidence as potentially sensitive even when output previews are sanitized.

## Policy Table

| File or directory                                                                                        | Generated?                         | Commit?                                                                   | May contain sensitive info?                                        | Regenerate with                                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `AGENTS.md`                                                                                              | Yes                                | Usually yes                                                               | Low, unless manual sources include secrets                         | `opencode-plusplus build .`                                          |
| `AGENTS.manual.md`                                                                                       | No, migration/helper only          | Optional                                                                  | Depends on what you write                                          | Edit manually                                                        |
| `.agent-context/AGENTS.generated.md`                                                                     | Yes                                | Usually yes if your repo commits generated context                        | Low                                                                | `opencode-plusplus build .`                                          |
| `.agent-context/repo-summary.md`, `onboarding.md`, `context-layers.md`                                   | Yes                                | Usually yes                                                               | Low                                                                | `opencode-plusplus build .`                                          |
| `.agent-context/key-files.md`, `module-map.md`, `architecture.md`, `dependency-graph.md`, `readiness.md` | Yes                                | Usually yes                                                               | Low to medium; includes repo structure                             | `opencode-plusplus build .`                                          |
| `.agent-context/contracts/*.json`                                                                        | Yes                                | Usually yes                                                               | Low                                                                | `opencode-plusplus build .`                                          |
| `.agent-context/index/*.json`, `.agent-context/graphs/*`, `.agent-context/evidence/*`                    | Yes                                | Project choice                                                            | Medium; includes paths, symbols, summaries                         | `opencode-plusplus build .`                                          |
| `.agent-context/rag/*`                                                                                   | Yes                                | Project choice                                                            | Medium; optimized for retrieval and may include snippets           | `opencode-plusplus build .`                                          |
| `.agent-context/tasks/*`                                                                                 | Yes                                | Optional                                                                  | Medium; task text may reveal intent                                | `opencode-plusplus pack "<task>" .`                                  |
| `.agent-context/runs/<task-id>/*`                                                                        | Yes                                | Usually no for local runs; optional for reviewed benchmark/demo artifacts | Medium; task prompts and boundaries may include repo details       | `opencode-plusplus run "<task>" .`                                   |
| `.agent-context/runs/<task-id>/iterations/*`                                                             | Yes                                | Usually no                                                                | High; executor output, diffs, decisions, trace summaries           | `opencode-plusplus orchestrate "<task>" . ...`                       |
| `.agent-context/worktrees/<run-id>/`                                                                     | Yes                                | No                                                                        | High; isolated executor checkout, manifests, and exported patches  | `opencode-plusplus orchestrate "<task>" . --checkpoint git-worktree` |
| `.agent-context/traces/*.json`                                                                           | Yes                                | No by default                                                             | High; commands, files, hashes, sanitized output previews           | `opencode-plusplus trace ...` or sidecar hooks                       |
| `.agent-context/traces/opencode-sidecar-events.jsonl`                                                    | Yes                                | No                                                                        | High; local sidecar events                                         | Start OpenCode with `opencode-plusplus`                              |
| `.agent-context/traces/tool-evidence/*.json`                                                             | Yes                                | No                                                                        | High; command evidence payloads with sanitized previews and hashes | Sidecar `tool.execute.after`                                         |
| `.agent-context/sidecar/latest.json`, `latest.md`                                                        | Yes                                | No                                                                        | Medium to high; local blocker/warning state                        | `opencode-plusplus sidecar verify .`                                 |
| `.agent-context/sidecar/policy.md`, `task-verify.md`, `hallucination.md`, `regression.md`                | Yes                                | No by default                                                             | Medium to high; local verification reports                         | `opencode-plusplus sidecar verify .`                                 |
| `.agent-context/hallucination/*`                                                                         | Yes                                | Usually no                                                                | Medium; transcript-derived claims                                  | `opencode-plusplus hallucination . --trace <trace-id>`               |
| `.agent-context/regression/*.json`                                                                       | Yes / curated                      | Commit curated memory, not transient reports                              | Medium; known issues and fragile modules                           | `opencode-plusplus build .`, `opencode-plusplus memory add-fix .`    |
| `.agent-context/memory/candidates/*.json`                                                                | Yes                                | No until reviewed                                                         | Medium                                                             | `opencode-plusplus memory learn-from-pr .`                           |
| `.agent-context/cache/*`                                                                                 | Yes                                | No                                                                        | Low to medium                                                      | `opencode-plusplus build .`                                          |
| `.agent-context/delta/*`                                                                                 | Yes                                | No by default                                                             | Medium; local change guidance                                      | `opencode-plusplus delta .` or `opencode-plusplus evolve .`          |
| User OpenCode plugin `%USERPROFILE%/.config/opencode/plugins/opencode-plusplus.js`                       | User-owned                         | No; installed by the Windows EXE                                          | High; global guard and evidence runtime                            | `opencode-plusplus-setup-win-x64.exe`                                |
| `.opencode/commands/opencode-plusplus.md`, `.opencode/commands/opencode-plusplus-verify.md`              | Yes                                | Usually yes                                                               | Low                                                                | `opencode-plusplus opencode init .` or `opencode-plusplus oc init .` |
| `.opencode/agents/opencode-plusplus.md`                                                                  | Yes                                | Usually yes                                                               | Low                                                                | `opencode-plusplus opencode init .` or `opencode-plusplus oc init .` |
| `opencode-plusplus.config.yml`                                                                           | Starter generated, then user-owned | Yes                                                                       | Low to medium                                                      | `opencode-plusplus init .`                                           |
| `opencode-plusplus.local.yml`                                                                            | User-owned local config            | No                                                                        | High; can contain local paths or credentials                       | Copy from `opencode-plusplus.local.example.yml`                      |

## Recommended `.gitignore`

For most repositories, commit the stable context and OpenCode integration files, but ignore runtime evidence:

```gitignore
.agent-context/cache/
.agent-context/traces/
.agent-context/sidecar/
.agent-context/runs/*/iterations/
.agent-context/worktrees/
.agent-context/delta/
.agent-context/memory/candidates/
opencode-plusplus.local.yml
```

If your team does not want generated repository context in git, ignore all of `.agent-context/` and regenerate it locally:

```gitignore
.agent-context/
AGENTS.md
```

In that mode, keep `AGENTS.manual.md` or another human-authored guide if you still want stable agent instructions in the repository.

## Why This Repository Commits `.agent-context`

This project intentionally keeps a generated `.agent-context/` in the repository because it is both the product output and a test fixture for dogfooding. That does not mean every downstream project should commit every `.agent-context` file.

Use this split:

- **Commit:** stable guidance, contracts, generated summaries, OpenCode plugin/commands when shared with the team.
- **Do not commit:** traces, sidecar latest reports, tool evidence, caches, local config, and transient task iterations.

## Sensitive Evidence Notes

OpenCode++ sidecar evidence is safer than raw logs, but it is still local runtime evidence:

- long stdout/stderr is passed to `record-tool` through a JSON evidence file, not command-line arguments;
- raw output is hashed;
- stored previews are redacted and truncated;
- missing exit code is recorded as `unknown`, not `passed`;
- working-tree hashes and touched file lists can still reveal local activity.

Keep `.agent-context/traces/` and `.agent-context/sidecar/` out of git unless you have a deliberate audit workflow.
