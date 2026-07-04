# Testing, Smoke Prompts, And Development Checks

[中文](testing.zh.md) · [Back to README](../README.en.md)

## Claude Code Smoke Prompts

After installation or config changes, ask these in Claude Code in order. They cover route detection, search, fetching, paging, scholar search, and PDF handling.

```text
Use net-tools proxy_status.
Use net-tools search_status.
Use net-tools search_web to search "叶兰峰是谁" count 5.
Use net-tools search_web to search "BERT Bidirectional Encoder Representations from Transformers Google arXiv 1810.04805" count 5, then summarize the key sources.
Use net-tools fetch_url to read https://example.com with extract readable include_links true link_limit 10.
Use net-tools scholar_search to search "Attention Is All You Need Vaswani 2017 transformer" count 5.
Use net-tools search_web to search "Attention Is All You Need arXiv PDF" count 5, choose the official arXiv PDF, then use net-tools fetch_pdf to read it.
```

A good run does not require every provider to succeed. It should show the active route, have at least one working search provider, return body text/status/`next_offset` where applicable from `fetch_url`, avoid repeated arXiv requests after HTTP 429, and provide clear diagnostics if local `pdftotext` is unavailable.

## Session Smoke Prompts

```text
Use net-tools session_create to create a session named demo with headers {"X-Test":"ok"}, cookies {"token":"example"}, and referer "https://example.com/".
Use net-tools session_status for session demo.
Use net-tools fetch_url to read https://example.com with session demo and extract readable.
Use net-tools session_clear for session demo.
```

## Development Check

```powershell
npm run check
npm test
```

`npm run check` checks Node syntax and compiles the Python build. `npm test` starts a local offline fixture and tests both builds through MCP JSON-RPC, covering:

- Tool list and schema parity.
- `fetch_url` paging and link extraction.
- `session_create/session_status/session_clear` plus session headers/cookies/referer.
- `search_status` provider diagnostics.
- arXiv HTTP 429 cooldown without repeated requests.

It does not download dependencies.