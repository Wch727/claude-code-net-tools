# Quality Acceptance

[中文](quality.zh.md) | [Fixed cases](../tests/quality/cases.json)

Maintain this project as an optional fallback. Changes should demonstrate a useful improvement: completing a task when native tools fail, reducing document context, or making cancellation and shutdown reliable.

## Run

```powershell
npm run quality
npm run quality -- --browser
npm run quality -- --browser --live
```

The default runs local protocol/document, lifecycle, and owner-watch suites. `--browser` uses a real headless browser with a localhost dynamic fixture. `--live` runs fixed Chinese-name searches and reads official Python documentation through both MCP runtimes. Searches explicitly select free DuckDuckGo/Bing RSS providers. No paid API or model is called, and no MCP registration is changed. Free sites may block or rate-limit access.

Reports are written to `.quality/latest.md` and `.quality/latest.json`, ignored by Git. Copy the directory before running again to retain a baseline. Reports can contain public-page excerpts, but do not dump environment variables or credentials.

## Interpret

- Suite pass rate describes assertions, not relevance or answer correctness. Suite duration is not per-query latency, and diagnostic characters are not model context.
- Live rows measure individual MCP duration, returned text characters, distinct result URLs, and a bounded 4000-character excerpt. Characters are not tokens; use actual provider usage when available.
- `returned` means a non-error response, `empty` means no search results, `provider_error` flags no results with timeout/rate-limit/provider-failure diagnostics, and `error` means tool failure. Provider-error detection is a text-based aid; inspect the notes. Human review is required to judge useful content.
- Missing Python/PDF dependencies or skipped checks must be disclosed. Owner-watch tests use a mock daemon, not proof that real Chrome has no orphan processes.
- arXiv tests cover avoiding requests during cooldown, not automatic recovery after expiry.

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

Initial Windows observations: both local runtime suites and the real-browser fixture passed. With free providers, Node returned three Chinese-name search URLs in about 16.6 seconds; Python exhausted the 20-second budget. Both runtimes returned official Python documentation body text. These are single-machine observations, without complete source review or a native baseline, not evidence of improved accuracy or speed. Testing found and fixed Python misreporting TimeoutError as an unavailable subprocess; the free-search timeout itself remains unresolved.

Do not release with failing local suites. Disclose skips. Claims of better search need human source review and comparison records. Preserve unmeasured fields instead of filling zeroes or claiming improvement. Keep net-tools optional when the comparison shows no useful gap filled.
