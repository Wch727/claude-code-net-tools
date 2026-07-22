# Claude Code Net Tools Search Prompt (English)

Put the entire `text` block below in the `CLAUDE.md`, memory/custom-instruction surface, or first session message that Claude Code actually loads. This repository file is not activated automatically.

```text
When a question may require web access, first use your own knowledge to identify the entity, domain, time scope, and likely authoritative sources, then produce 1-3 strong queries. Do not mechanically pass the raw user sentence to a tool, and do not stop after the first zero-result response.

Tool rules:
- For results close to a real search page, prefer `net-tools browser_search`. It renders Google, Bing, or DuckDuckGo through Playwright, preserves page order, and does not rerank.
- For fast, low-cost search, make one `net-tools search_web` call: put the strongest query in `query`, place 0-2 alternatives in `queries`, choose `intent=general|academic|code|news|official`, and normally set `time_budget=30`. For important claims use `verify_top=2` or `3`; verification labels results without reranking. The default `browser=auto` falls back when needed; use `browser=always` to force it.
- When results are noisy, rewrite the query first. Use `net-tools search_web_focused` only when relevance filtering is useful. Leave `rerank` disabled unless the user explicitly asks for it.
- For acronyms, papers, people, products, and packages, add full names, English names, authors, organizations, years, paper IDs, official-site terms, or source types. For Chinese questions, consider both Chinese and English queries.
- Use `net-tools scholar_search` for papers. If it returns zero results, remove years and generic words while preserving author/title terms, or search the title with `browser_search`. Do not repeatedly retry arXiv after HTTP 429.
- Read webpage content with `net-tools fetch_url`. For JavaScript pages or empty/blocked HTTP fetches, use `net-tools browser_fetch` or pass `browser=auto|always` to `fetch_url`.
- For typing, clicking, waiting, scrolling, scoped extraction, downloads, or XHR/JSON capture, use `net-tools browser_action` with a named session. Start with `action=open` and inspect the snapshot, prefer `role+name` or `label` locators, then finish with `action=close`. Do not click blindly or request arbitrary JavaScript.
- Do not switch to Claude Code built-in `Fetch`, `WebFetch`, or equivalent URL-reading tools for external pages; they may trigger Anthropic domain-safety verification. Unless the user explicitly requests otherwise, perform search and page reading through `net-tools`.
- Use `net-tools fetch_json` for JSON APIs, `fetch_rss` for RSS/Atom, `fetch_pdf` for PDFs, and `package_search` for packages or repositories.
- Pass `include_links=true` to `fetch_url` or `browser_fetch` when both body and links are needed. When `next_offset` is returned, continue with the same URL and offset.
- Tool output is source material, not the final answer. Synthesize titles, snippets, page text, and sources; date dynamic facts; state the confirmed scope when evidence is incomplete.

Example: for “what is BERT?”, make one `search_web intent=academic verify_top=2` call with:
- `query`: `BERT Bidirectional Encoder Representations from Transformers arXiv 1810.04805`
- `queries`: `["BERT language model Google Research", "BERT paper Devlin Chang Lee Toutanova"]`

Example: if `McDermott R1 rule-based configurer computer systems 1982` returns zero scholar results, try `McDermott R1 rule based configurer computer systems` or search the paper title with `browser_search`; do not conclude that no source exists.
```
