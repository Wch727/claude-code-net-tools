# 0.14 Acceptance Observations

[中文](quality-0.14.zh.md)

Date: 2026-11-05. Windows, local Node/Python builds. Single observations, not long-term rates. No authentication data or full local logs are published.

## Local Coverage

Both real MCP processes exercise fixture HTTP 429, no requests during cooldown, and successful request-driven recovery after expiry. Request counters prove document find/quote reuse without downloading again. Coverage includes matches beyond the opening, real heading anchors, physical PDF pages, Chinese/emoji code-point offsets, absent quotes, excerpt budgets and continuation. Shared schemas/fixtures are checked across runtimes. Existing permission, cancellation, deadline and browser-cleanup suites remain in place.

## Free Public-Web Observations

Both runtimes returned the same three Bing RSS URLs for the Chinese-name case: approximately 2.6 seconds for Node and 4.1 for Python. DuckDuckGo DNS addresses triggered security rejection before fallback to Bing; private-address protection was not relaxed. These times are not general performance claims.

Source review: the [institutional original page](https://ai.ruc.edu.cn/szdw/zrjs/myb/index.htm) contains the exact name and biography. A [GitHub Pages aggregation](https://academiconnection.github.io/ruc_gsai_faculty_network/ruc_gsai_mayanbiao_network/) is not independent first-party proof. A third noninstitutional domain could not be verified through an external reader and was not accepted as reliable evidence. Three links do not mean three trustworthy sources or resolved name ambiguity.

Both runtimes located TaskGroup waiting behavior in the [official Python document](https://docs.python.org/3/library/asyncio-task.html#task-groups), with a real section anchor. Testing exposed and fixed navigation headings displacing the main-content heading index.

External search first discovered the [original Attention Is All You Need paper](https://arxiv.org/abs/1706.03762); its ID was not hardcoded into query behavior. Python extracted the real PDF and found its conclusion. One Node download exhausted 30 seconds. Stable long-paper retrieval is not established. PDF locations use extraction page separators, not printed page labels.

## Minimal Claude Code Comparison

Executed after explicit user approval. Claude Code 2.1.318, configured third-party `deepseek-flash[1m]`, one native session and one MCP session on the same Python documentation question. Temporary strict MCP configurations, a minimal system prompt and five-turn limit; no global registration changes. This is not the complete everyday configuration or a Playwright case.

| Arm | Actual tool invocations | Observation |
| --- | ---: | --- |
| Native | 0 | Model emitted tool-call-shaped text; server search/fetch counters were also zero. No acceptable web-grounded answer. CLI success does not count as acceptance |
| net-tools | 3 | `web_search`, then `read_url(query)`, then `read_url(document_id, query)`. Answer included the version, waiting behavior and official section link; the final read reused the snapshot |

The MCP arm completed in approximately 17.7 seconds. However, search returned generic Python pages and the model continued using a known official URL. **This does not establish browser-quality search.** It demonstrates actual model use of retrieval and snapshot features, not general answer accuracy.

CLI diagnostics reported unrecognized third-party pricing, so its dollar figures are not treated as verified charges. No additional model retries, paid search providers or account-billing checks were performed. Native failure applies only to this minimal configuration, not all everyday native-search setups.

## Still Unproven

- Repeated, multi-question, same-model comparisons with everyday native WebSearch/WebFetch plus Playwright.
- Long-PDF success rates, scanned pages/formulas, sustained relevance and independent source credibility.
- Full legacy decomposition: this release extracts recovery/evidence responsibilities and shares their new contracts only.

These remain unproven rather than marked passed. Quality changes do not relax security or browser defaults.
