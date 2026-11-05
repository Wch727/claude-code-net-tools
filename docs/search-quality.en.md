# 0.14.2 Search Quality Improvements

[中文](search-quality.zh.md)

## Fixes

- Parse organic HTML result cards instead of arbitrary page links. Bing breadcrumbs, navigation and footer links no longer substitute for results.
- Preserve snippets from Bing, DuckDuckGo, Sogou and 360 cards. Attribute order and inline title markup are supported without splitting identifiers such as `Task<em>Group</em>`.
- Search feeds handle namespaces, CDATA and HTML entities. Python no longer silently treats unexpected non-feed responses as empty success. Parsing does not execute scripts or expand custom XML entities; DTD/ENTITY declarations are rejected and input/node/depth limits apply.
- With `required_terms`, `allowed_domains` or `blocked_domains`, inspect at least 10 free-provider candidates before filtering and taking the requested count. Paid-provider request counts do not increase. Unconstrained requests retain their original count.
- Apply domain constraints before a provider fills the candidate quota, so excluded results do not stop later qualifying sources. Preserve order without adding scores or reranking.
- Exclude Crossref `type=component` from paper results. A real query exposed a supplementary `.docx` returned as a paper. Articles, proceedings, preprints and books are not excluded by this rule.

## Upgrade

Run `npm ci` in the repository for Node; it installs pinned `htmlparser2` and `entities` dependencies. Python HTTP search still uses the standard library with no additional pip dependency. Existing Node/Playwright browser requirements are unchanged.

## Verification

```powershell
npm test
node tests/quality/search-live.mjs --run
python tests/quality/inspect-free-search.py --run
```

`npm test` uses local fixtures and mock services. The other commands make free public-web requests only: no Claude model, paid API, automatic browser launch or global configuration change. Ignored `.quality/search-latest.json` records version, commit and dirty-worktree state.

Deterministic improvements: reversed DuckDuckGo link attributes still parse; snippet-only TaskGroup matches survive explicit filtering; a tenth free candidate can be returned after constraints; two excluded-domain sources no longer prevent a third qualifying source; supplementary components are not labeled papers. Shared fixtures compare both runtimes field by field.

## Live Observations and Limits

In a three-case smoke test on 2026-11-05, both runtimes returned exact-name Chinese sources and the original BERT paper's DOI/arXiv records. Literal name presence does not resolve identity ambiguity; two links to the same paper are not independent sources.

The TaskGroup identifier case still produced no qualifying sources: original Bing HTML/RSS contained off-topic content, while DuckDuckGo timed out or was rejected by address policy. Shorter queries, quotes and market-parameter experiments did not establish improvement and were not added to defaults. Safety checks were not relaxed and known constraint failures were not returned just to fill the quota.

**This fixes information loss, premature candidate truncation and late domain filtering, not browser-quality search in every case.** Literal counts are not factual accuracy, semantic relevance or source credibility. No further live Kimi/MiniMax account or everyday Claude Code comparison was run in this round.

One Python safety-test process exceeded its 15-second shutdown budget; an isolated rerun passed, with root cause still unconfirmed. Diagnostics now identify the process, last request and owned mock-session actions and preserve an original request failure if cleanup also fails. No budget or assertion was weakened; a passing rerun does not establish that intermittent shutdown issues are fixed.
