# 0.14.1 Source and Reading Fixes

[中文](search-fixes.zh.md)

## Separate Sources From AI Summaries

Kimi/MiniMax no longer use the API service address as a search result URL. The adapters prefer `search_results`, `citations`, message citations and URL annotations, with model-text links separately labeled. Responses without an original-page URL produce an explicit diagnostic, not a fabricated citable result.

| `source_type` | Meaning |
| --- | --- |
| `provider_citation` | URL from an API citation field, not yet fetched and checked locally |
| `model_link` | URL extracted from generated text; potentially wrong or fabricated until read |

Summaries are labeled `AI-generated summary (not original page text)`. API-host addresses, embedded URL credentials and non-HTTP(S) links are rejected. `verify_top` checks HTTP reachability only, not summary accuracy, factual truth or publisher identity.

## Optional Required Terms

MCP `web_search` arguments:

```json
{"query":"Python asyncio TaskGroup documentation","required_terms":["TaskGroup"],"count":3,"browser":"never"}
```

The default empty list leaves existing results unchanged. Otherwise all literal terms must appear in the title, URL or search snippet, using ASCII case-insensitive matching. Generated AI summaries do not establish source relevance just by repeating the question. Up to six terms, each at most 128 Unicode characters.

Filtering runs before provider batches fill the result quota so remaining sources can contribute. Final browser results are filtered too. No scoring or reranking; insufficient matches may yield fewer or zero results. This cannot manufacture recall. Guidance is embedded in MCP tool descriptions; no manual prompt installation is needed.

## PDF Budgets and Fallback

`timeout` now bounds downloading, extraction and fallback together rather than granting each stage a full budget. Downloads get at most 70% when an arXiv HTML fallback exists, otherwise 85%, leaving extraction headroom. Short budgets may still fail on large files.

arXiv download timeouts and transient connection failures can now reach the existing HTML fallback; previously they escaped immediately. Authentication refusals and HTTP 429 do not trigger another fallback request. Cancellation does not start new work, and `html_fallback=false` remains respected. HTML fallback no longer forces browser launch: it respects `browser`, defaulting to HTTP when absent.

Successful PDF snapshots include `timings.download_ms` and `timings.extraction_ms`. Cached reads retain original-fetch timing, not cache latency. Failures distinguish download and extraction stages. DNS/TLS/first-byte timing is not yet separated; not every long paper or site is guaranteed readable.

## Verification Boundaries

New tests cover both runtimes with local mock APIs, source-less responses, optional filters, slow-PDF budgets and download-error-to-HTML fallback. They do not call real Kimi/MiniMax or other paid APIs. Fixtures do not establish every live account/response-format compatibility or long-term free-search relevance.

Source normalization and optional filtering are isolated in `search-quality.mjs` / `search_quality.py`; legacy server bodies are not broadly rewritten. The repository owner selected [MIT](../LICENSE); third-party dependencies retain their own licenses.

One free live smoke test downloaded the same real arXiv PDF and located its conclusion in both builds: approximately 2.3 seconds for Node and 6.5 seconds for Python. This is not a long-term rate or proof that the earlier timeout was solely a project defect. A `TaskGroup`-constrained query yielded no qualifying results: DuckDuckGo was rejected by address safety policy and Bing returned generic or empty results. Filtering prevents irrelevant results from passing the explicit constraint; **improved free-search recall remains unproven**. No additional billable model test was run.
