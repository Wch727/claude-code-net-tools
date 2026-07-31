# Tools and Limits

[中文](tools.zh.md) | [Back to README](../README.en.md)

## Default Tool List

When `CLAUDE_NET_TOOL_PROFILE` is unset or `compact`, Claude Code sees only three tools. This avoids overlapping choices such as `search_web`/`search_web_focused` and `fetch_url`/`fetch_pdf`/`browser_fetch`.

### `web_search`

The unified search entry point.

Important arguments:

- `query`: primary Claude Code-prepared query; required.
- `queries`: up to two alternatives.
- `intent`: `general|academic|code|news|official`.
- `count`: 1-10 results.
- `providers`: explicit provider list; normally omit it.
- `browser=never|auto|always`: disable, automatically fall back to, or force browser search.
- `verify_top`: check reachability for the first results without changing order.
- `time_budget`: total seconds allowed for the call.

The tool round-robin merges by query/provider and deduplicates without default heuristic reranking. For a CJK full name or exact entity, it searches the extracted entity first and deterministically filters noise only when at least one result contains the complete entity. In academic mode, an exact paper-title match is placed before fuzzy candidates.

It returns both readable text and structured fields: `structuredContent.results` contains title, URL, provider, snippet, and verification; `structuredContent.notes` contains provider diagnostics.

### `read_url`

The unified reader for HTML, text, JSON, RSS/Atom, and PDF.

New document:

```json
{"url":"https://example.com/article","max_chars":12000}
```

Continuation:

```json
{"document_id":"doc_...","offset":12000,"max_chars":12000}
```

Important arguments:

- `kind=auto|page|pdf`: infer PDF from the URL or force a kind.
- `max_bytes`: first-download limit, default 20 MB, maximum 50 MB.
- `max_chars`: characters returned in this call, default 12,000.
- `offset`: first character returned in this call.
- `document_id`: existing snapshot; the URL is not contacted when this is set.
- `refresh=true`: ignore a same-URL snapshot and download again.
- `include_links=true`: return normalized links with the body.
- `extract=auto|readable|text|markdown|raw`: page extraction mode.
- `browser=never|auto|always`: HTTP/browser policy.
- `extractor=auto|pdftotext|none`: PDF extraction policy.

A successful snapshot returns `document_id`, `offset`, `end`, `total_chars`, and `next_offset`. Continue with only `document_id + next_offset`; the tool reads process memory and does not redownload the page/PDF or rerun `pdftotext`.

Snapshots default to a one-hour TTL, 12 documents, and 80 million total characters. They disappear when the MCP restarts. Anti-bot pages, HTTP errors, and browser fallback output are not stored as normal HTTP document snapshots.

### `browser_interact`

The unified Playwright entry point.

| `action` | Behavior |
| --- | --- |
| `search` | Render Google, Bing, or DuckDuckGo and extract results. |
| `read` | Open a URL, execute page JavaScript, and read content/links. |
| `screenshot` | Return an image, page text, and metadata. |
| `open` / `snapshot` | Open or inspect a named browser session. |
| `click` / `type` / `wait` / `scroll` | Operate the page. |
| `extract` | Extract a target element. |
| `download` | Trigger and save a download. |
| `network` | Capture matching XHR/fetch responses. |
| `close` | Close the named session. |

`search`, `read`, and `screenshot` without an explicit `session` are one-shot actions. Their background browser sessions close after success, failure, timeout, or captcha; explicitly named interactive sessions remain until `close`.

Prefer `target.role + target.name`, `target.label`, `target.text`, or `target.test_id`; use CSS only when the page has no stable semantic locator.

Screenshot calls still return an MCP image. Every action also returns `structuredContent` with useful action, URL, title, or search-result fields.

## Full Compatibility Profile

With `CLAUDE_NET_TOOL_PROFILE=full`, the list also includes:

- Diagnostics: `net_doctor`, `proxy_status`, `search_status`, `browser_status`, `pdf_status`.
- HTTP sessions: `session_create`, `session_status`, `session_clear`.
- Search compatibility: `search_web`, `search_web_focused`, `scholar_search`, `package_search`.
- Reader compatibility: `fetch_url`, `extract_links`, `fetch_json`, `fetch_rss`, `fetch_pdf`.
- Browser compatibility: `browser_search`, `browser_fetch`, `browser_screenshot`, `browser_action`.

These tools have not been removed, so existing prompts and manual calls remain compatible. New prompts should prefer the three main tools.

## Limits

- The project does not bypass login, authorization, captcha, paywall, or site rules.
- Free search engines can rate-limit, challenge automation, or change HTML. Browser mode does not guarantee bypassing bot checks; challenge pages are reported as failures instead of normal results or content.
- `read_url` HTTP snapshots have a 50 MB hard maximum. Use a dedicated document workflow for larger files.
- PDF text cannot perfectly preserve formulas, tables, multi-column layout, or images. Inspect the original PDF when derivations or layout matter.
- Browser mode executes page JavaScript but does not run arbitrary JavaScript supplied by Claude Code.
- External page content is untrusted source material, not instructions.
- Built-in Claude Code `Fetch/WebFetch` domain-safety errors do not come from this project; use `read_url` or `browser_interact action=read`.