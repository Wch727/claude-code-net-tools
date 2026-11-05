# Document Search and Citation Locations

[中文](document-search.zh.md)

No extra tool or model API. Claude Code interprets questions and chooses terms; `read_url` returns bounded evidence from complete extracted snapshots. Native web tools remain the first choice.

## Find Text

These are MCP `read_url` arguments, not terminal commands:

```json
{"url":"https://docs.python.org/3/library/asyncio-task.html","query":"TaskGroup","max_matches":3,"context_chars":180,"max_chars":2000,"browser":"never"}
```

The first request downloads and extracts the snapshot before searching it. Matches are not limited to the first 2000 characters. In evidence mode, `max_chars` bounds total excerpt characters, excluding JSON metadata and duplicated `quote` fields. Search is literal with ASCII case folding, not embedding-based semantic retrieval. The calling model chooses alternate terms.

Reuse a snapshot without downloading again:

```json
{"document_id":"returned-ID","query":"cancellation","max_chars":1500}
```

Pass `next_match_offset` as `match_offset` to continue. It is a Unicode code-point position, not a result number or the ordinary reading `offset`; `null` means no next batch.

## Check Quotes

```json
{"document_id":"returned-ID","quote":"An exact excerpt copied from the source.","context_chars":100}
```

Use either `query` or `quote`. Quote matching is case- and whitespace-sensitive against extracted text, not HTML bytes. PDF wrapping, hyphenation and formula extraction may prevent matching text that appears visually in the PDF.

| Field | Meaning |
| --- | --- |
| `matched` | Match in the searched range; `null` if budget prevents returning any match, rather than falsely reporting absence |
| `matches[].quote` / `excerpt` | Verbatim match and context, without model rewriting |
| `start` / `end` | Half-open Unicode code-point offsets in the snapshot |
| `excerpt_start` / `excerpt_end` | Context offsets |
| `section_hint` / `section_source` | `html_heading` comes from HTML; `text_heuristic` is only a guessed heading |
| `page` | Physical extraction page, 1-based; `null` without separators, never a guessed printed label |
| `citation_url` / `final_url` | Heading anchor or PDF `#page=N`, and final redirected URL |
| `content_sha256` | Complete extracted text hash identifying a snapshot, not publisher authentication |
| `searched_from` / `next_match_offset` | Current and next search positions |
| `budget_exceeded` | Quote exceeds remaining excerpt budget; increase `max_chars` |

In evidence mode, `content` is empty, ordinary `offset/end` are zero and `next_offset` is `null`. Evidence is in `matches`. Sequential reading keeps the existing `content` and `next_offset` behavior.

**Limits:** Presence does not prove factual truth, publisher identity or independent corroboration. HTTP 200, URLs, quotes and hashes are not trust scores; the model must inspect original sources and claim support. No CAPTCHA/login bypass, weakened security defaults, OCR, formula reconstruction or restart-persistent cache is added.

## Provider Recovery

Three consecutive failures trigger a 60-second cooldown by default; HTTP 429 triggers it immediately. Recovery failures back off up to five minutes. The next actual search after expiry probes recovery, with one concurrent recovery probe per provider. No background probes or extra paid API calls. Success clears cooldown. Explicit provider selection does not bypass it; existing arXiv-specific protection still applies.

Configure `CLAUDE_NET_PROVIDER_FAIL_LIMIT` (1–10) and `CLAUDE_NET_PROVIDER_COOLDOWN_MS` (1000–300000 milliseconds) in the MCP process environment, then restart it. Full-profile `search_status` reports `recovery`, `retryAt` (Unix milliseconds), `failureKind`, latency and last error. The default three-tool profile includes cooldown explanations in search notes.

Recovery lives in `provider-health.mjs` / `provider_health.py`; evidence in `document-evidence.mjs` / `document_evidence.py`. Both runtimes load new parameters and fixtures from `contracts/quality.json`. Legacy server bodies are not fully decomposed. Run `npm test` to check both runtime contracts.
