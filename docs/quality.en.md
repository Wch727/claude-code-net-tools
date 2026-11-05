# Quality Acceptance

0.14.3 adds a separate [30-case search failure baseline](reliability-0.14.3.en.md) for parsed candidates, exclusions, provider errors and original-page read failures. The original eight acceptance scenarios remain separate; transport success is not search accuracy.

[中文](quality.zh.md) | [Fixed cases](../tests/quality/cases.json)

Maintain this project as an optional fallback. Changes should demonstrate a useful improvement: completing a task when native tools fail, reducing document context, or making cancellation and shutdown reliable.

## Run

```powershell
npm run quality
npm run quality -- --browser
npm run quality -- --browser --live
```

An optional, billable Claude Code comparison is available separately: `node tests/quality/claude-live.mjs --run`. It reads the current user's model authentication into child-process environment only, never repository files or command-line arguments. Each of two sessions is limited to 5 turns and 150 seconds with a CLI budget of USD 0.15 per arm. **Unrecognized third-party pricing means this is not a reliable hard cap on actual provider billing.** It does not install MCP configuration or load global MCP servers. Output: ignored `.quality/claude-live.json`. The native arm exposes WebSearch/WebFetch only; this document case is not a full Playwright comparison. A CLI success without real tool invocation fails acceptance. CLI cost reporting is not a verified bill.

See [0.14 acceptance observations](quality-0.14.en.md), including failures and unmeasured areas.

The default runs local protocol/document, lifecycle, and owner-watch suites. `--browser` uses a real headless browser with a localhost dynamic fixture. `--live` runs fixed Chinese-name searches and reads official Python documentation through both MCP runtimes. Searches explicitly select free DuckDuckGo/Bing RSS providers. No paid API or model is called, and no MCP registration is changed. Free sites may block or rate-limit access.

Reports are written to `.quality/latest.md` and `.quality/latest.json`, ignored by Git. Copy the directory before running again to retain a baseline. Reports can contain public-page excerpts, but do not dump environment variables or credentials.

The P0 update adds default network-permission, redirect, credential-permission and session-isolation tests. `--browser` also verifies real browser/daemon PIDs exit after abrupt test-MCP termination. The historical blank window still needs symptom-time attribution. See [secure defaults](security.en.md).

## Interpret

- Suite pass rate describes assertions, not relevance or answer correctness. Suite duration is not per-query latency, and diagnostic characters are not model context.
- Live rows measure individual MCP duration, returned text characters, distinct result URLs, and a bounded 4000-character excerpt. Characters are not tokens; use actual provider usage when available.
- `returned` means a non-error response, `empty` means no search results, `provider_error` flags no results with timeout/rate-limit/provider-failure diagnostics, and `error` means tool failure. Provider-error detection is a text-based aid; inspect the notes. Human review is required to judge useful content.
- The official-document case now locates TaskGroup waiting behavior directly. `evidence_missing` means retrieval returned no match and fails the acceptance command, rather than counting empty evidence as successful reading.
- Missing Python/PDF dependencies or skipped checks must be disclosed. Default owner-watch tests use a mock daemon; `--browser` separately checks real PID exit. Do not conflate them.
- Both runtimes test local HTTP 429, no requests during cooldown, and recovery through an actual MCP request after expiry; controlled-clock tests cover single recovery probes. Live arXiv-specific expiry recovery remains unmeasured.

## Native Comparison

Use the same machine, network and Claude Code model for both arms. A: disable net-tools and use native WebSearch/WebFetch plus existing Playwright. B: temporarily enable net-tools and explicitly request it for testing. Start a fresh conversation per case, run once first, then repeat differences three times. Keep proxy, model and versions constant. The paper-discovery prompt does not supply an arXiv ID.

This script does not call native Claude Code tools. Native baseline measurements and model tool-selection behavior remain unmeasured until these conversations are run. Model/search costs are a separate operator decision; the script does not trigger them.

Record these fields per arm and case:

The first run creates `.quality/comparison.csv` with 16 unmeasured rows covering both arms. Subsequent runs preserve this file, so reviewed results can be entered with a spreadsheet editor.

| Field | Definition |
| --- | --- |
| Completion | Complete / partial / failed / unmeasured |
| Relevant-source ratio | Distinct reviewed original URLs supporting the question / distinct reviewed URLs; zero denominator is unmeasured |
| Read success rate | URLs yielding relevant body content rather than errors/challenges / distinct attempted URLs |
| Time to first useful source | Submission to first reviewed relevant source; failure if none |
| Total duration | Submission to task end |
| Output volume | Tool text characters; actual tokens separately if available |
| Evidence | Final URL, supporting excerpt, section or PDF page |
| Leftover processes | Before/after task-owned CLI/daemon/browser processes, not all Chrome processes |
| Cost | Actual billing/usage, or unmeasured |

HTTP 200, citation count and reachable pages do not prove credibility. Do not assume the identity of a person in advance; check ambiguity. Treat formulas, scanned PDFs and login pages as explicit capability boundaries.

## Release Gate

Providers retain configured order. When alternatives remain, the current provider receives at most an equal share of the remaining total budget, capped at eight seconds; the final provider may use the remainder. This reserves fallback opportunities without changing result order or guaranteeing every site responds in time. Python uses a scoped provider deadline while preserving parent cancellation.

Follow-up fix: Python Bing RSS prefers installed curl, aligning its transport with Node; urllib remains available when curl is absent. One Windows live rerun returned three name-search URLs in approximately 8.9 seconds for Node and 11.1 seconds for Python. Python obtained Bing RSS results after DuckDuckGo timed out. Both official-document reads and local suites passed. This demonstrates a working fallback in that run, not guaranteed accuracy or universal performance improvement; link credibility was not automatically reviewed.

Initial Windows observations: both local runtime suites and the real-browser fixture passed. With free providers, Node returned three Chinese-name search URLs in about 16.6 seconds; Python exhausted the 20-second budget. Both runtimes returned official Python documentation body text. These are single-machine observations, without complete source review or a native baseline, not evidence of improved accuracy or speed. Testing found and fixed Python misreporting TimeoutError as an unavailable subprocess; the free-search timeout itself remains unresolved.

Do not release with failing local suites. Disclose skips. Claims of better search need human source review and comparison records. Preserve unmeasured fields instead of filling zeroes or claiming improvement. Keep net-tools optional when the comparison shows no useful gap filled.
