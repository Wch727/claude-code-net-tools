# 0.14.3 Installation Reliability and Search Failure Baseline

[中文](reliability-0.14.3.zh.md)

No new retrieval algorithm, default reranking or model integration. First establish fresh installation and observable failure stages; choose recall versus document retrieval work after reviewing the data.

## Install

From the cloned repository:

```powershell
# Windows: explicitly download pinned npm dependencies
.\scripts\install-claude-code.ps1 -Scope user -Runtime node -InstallDependencies
# Omit -InstallDependencies after npm ci
# Python ordinary HTTP needs no npm/pip
.\scripts\install-claude-code.ps1 -Scope user -Runtime python
```

```bash
# macOS / Linux
bash scripts/install-claude-code.sh --scope user --runtime node --install-dependencies
bash scripts/install-claude-code.sh --scope user --runtime python
```

Node requires Node.js 20+, curl and repository npm dependencies. Python ordinary HTTP requires Python 3.10+ and this checkout's standard-library implementation, not pip packages. Python browser operations still require Node/Playwright; PDF text extraction still requires pdftotext. The installer does not install browsers or PDF tools.

Default behavior checks only. The explicit installation option runs `npm ci`, using package-lock.json and potentially npm networking. Offline preflight checks versions, core dependencies, curl (Node), and actual MCP initialize/tools/list startup. It does not search, launch browsers or invoke models. Preflight failure does not change registration, including the removal step of `-Force` / `--force`. Registration failures return nonzero and no Done message. Forced replacement is not transactional: if removal succeeds but adding fails, register again.

Full generated commands are no longer printed because proxy arguments may contain credentials. Restart Claude Code and start a fresh session after registration. Offline startup does not prove public-network, search-quality or browser availability.

```powershell
npm run test:install
# Fresh temporary directory, real dependency download (explicit networking)
npm run test:install:fresh
```

Installation tests use a fresh path with spaces and a fake Claude CLI, never real user configuration. Coverage includes missing-dependency rejection before removal, Python without node_modules, Node startup, real npm ci in fresh mode and CLI failure propagation. CI runs fresh mode before the main checkout's npm ci.

## Fixed Search Cases

[30 cases](../tests/quality/search-cases.json) cover names, technical identifiers, official docs, papers, standards and concepts. Six development cases cover known regressions; 24 test cases provide a frozen comparison. The report records the dataset hash. These public cases are not a secret test set and have not been independently validated. Existing eight reliability/acceptance scenarios remain separate.

```powershell
# Help only; no network
npm run quality:search
# Three cases, both runtimes, no page reads
npm run quality:search -- --run
# All 30, Node baseline; at most one original URL read per case
npm run quality:search -- --run --limit 30 --runtime node --reads 1
# Optional literal-term filtering comparison, not a ranking algorithm
npm run quality:search -- --run --limit 3 --mode terms
```

Use `--case taskgroup,person-mayb` to select IDs; --limit defaults to 3 and is capped at 30. General cases use bing_rss/duckduckgo/bing_html; academic cases use crossref/arxiv. No configured paid API, Claude model, browser or global registration is selected. Searches have a 20-second budget and reads 10 seconds. Existing provider cooldown remains active; a long batch is not a set of independent identically distributed trials.

Reports: `.quality/search-eval-<mode>-<runtime>.json` and `.md`, with version, commit, dirty status, dataset hash, queries, bounded public snippets, provider diagnostics and optional source reads/locations. Matching mode/runtime overwrites the previous report; retain previous artifacts before comparison. Reports are ignored by Git. Direct MCP calls do not measure actual Claude Code tool selection.

Completed rows are journaled to the matching `.partial.jsonl`, preserving measurements if interrupted. Rebuild a complete report offline after fixing diagnostics, without repeating network requests:

```powershell
node tests/quality/search-report.mjs .quality/search-eval-baseline-node.json
```

Rebuilding preserves queries, candidates, timings, read excerpts and human review, while updating diagnoses/metrics and diagnostics_rebuilt_at. This release corrects the old report's false detection of `time budget: 20s` configuration and error-related words in query text. Actual exhausted budgets remain failures; a cooldown skip is not a newly observed rate-limit request.

## Interpreting Failures

- `required_terms_excluded` / `domain_excluded`: explicit parsed-candidate exclusions, not proof the constraint is wrong or the results are semantically irrelevant.
- `rate_limited`, `challenge`, `timeout`, `deadline`, `address_policy`, `http_error`, `dns_error`, `cooldown`: observed diagnostic text, not an independently confirmed root cause. Several may coexist.
- `upstream_or_parser_empty`: parsed zero; raw-response inspection is necessary to distinguish an empty engine response from an unrecognized page structure.
- `unknown`: insufficient evidence; do not guess.
- `entity_literal_missing`: the existing CJK entity check found no complete literal match but kept results. This calls for review, not an automatic identity judgment.
- `read_failed`, `read_unverified`, `read_literal_missing`: read errors, inconclusive transport/content state, or no exact text match. None proves the page cannot support the answer.

Per-runtime nonempty rates and observed P50/P95 include failed/empty searches; read latency is separate. Tiny samples do not estimate production tail latency. `mcp_tool_calls` is not an HTTP request count. Unmeasured HTTP requests, model tokens and billing are null. Precision@3, task success, source independence and factual support remain unreviewed until a human inspects originals and fills review fields. HTTP 200, literal matches and URL counts are not quality labels; DOI/arXiv copies are not independent corroboration.

## Remaining Tracking

One Python safety-test shutdown exceeded its budget in 0.14.2; subsequent reruns and three-platform CI passed, but its root cause remains unconfirmed. The 15-second budget, cancellation/cleanup assertions and diagnostics remain intact. Installation checks do not replace lifecycle testing. No BM25F, embeddings, BGE or extra model call was added.

## Initial Local Baseline

The 30-case Node command above was followed by the first three Python cases. Reports record an uncommitted worktree at measurement time. No model, paid provider or browser was called. This single-machine observation is not overall accuracy or a fair cross-runtime performance comparison.

| Node observations | Count |
| --- | ---: |
| Nonempty search candidates | 30/30 |
| First URL returned successful HTTP status and text | 16/30 |
| First URL read error | 14/30 |
| Text obtained, specified literal present | 4/30 |
| Text obtained, specified literal absent | 12/30 |
| Search included a provider cooldown skip | 18/30 |

Observed search P50/P95 were 924/9945ms, excluding reads. Speed does not establish usefulness; skipped providers reduce latency. Read errors included six HTTP 403, one 404, three HTTP 200 responses without usable snapshots, two address-policy rejections and two other errors retained for inspection; these need not share a cause. All three Python cases returned candidates: TaskGroup's first read missed its literal, the person case recorded incomplete entity matching and a read failure, and BERT's first read matched. Do not compare three Python observations against thirty Node observations as a performance result.

Manual spot checks: TaskGroup's top three did not answer the asyncio question; ExceptionGroup returned Python home/download pages rather than exception documentation; Adam returned other optimization methods. A same-title Attention candidate did not establish the original Vaswani paper and its first read returned 404. The full-name case returned matching candidates but reading was denied by address policy. The BERT DOI resolved to ACL Anthology and was read successfully. All 90 candidates have not been reviewed; precision@3 and task success remain unreviewed. Four literal matches are not four successful tasks.

**Next: diagnose candidate recall and read failures before BM25F/reranking.** Inspect query/provider/budget observations in searchQueryCandidates / _search_query_candidates and academic candidate identity. MCP notes alone cannot distinguish upstream responses from parsing loss; use small targeted raw-response comparisons. Do not disable private-address protection or repeatedly retry rate-limited providers for diagnosis.
