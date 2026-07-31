# Tests and Smoke Checks

[中文](testing.zh.md) | [Back to README](../README.en.md)

## Installation Check

```powershell
claude mcp get net-tools
```

Expect `Status: Connected`. After an upgrade, fully restart VS Code/Claude Code and open a new session.

First ask in the new session:

```text
List the names of the currently available net-tools tools without calling them.
```

Compact mode should list only `web_search`, `read_url`, and `browser_interact`.

## Recommended Smoke Prompts

Use a separate new session for each prompt when you want to inspect tool selection clearly.

### 1. Person Search With Multiple Sources

```text
Use only net-tools for web access. Who is Ye Lanfeng? Rewrite the search query, open at least two independent sources, and answer with links.
```

Expected: `web_search`, then at least one `read_url`; no built-in Fetch/WebFetch.

### 2. Academic Search

```text
Use only net-tools. Which paper introduced BERT? Read the paper abstract page and report title, authors, year, arXiv ID, and three main contributions.
```

Expected: `web_search intent=academic`, then `read_url`. An empty result should trigger a query rewrite rather than an immediate “no source” conclusion.

### 3. Long-Paper Snapshot Continuation

```text
Use only net-tools to find and read Attention Is All You Need. Read the abstract and then the conclusion. If next_offset is returned, continue with document_id rather than downloading the URL again. Report each offset used.
```

Expected: the first `read_url` returns `document_id`; continuation passes only `document_id + offset` and reports `Snapshot: cache`.

### 4. URL Body and Links

```text
Use only net-tools to read https://example.com and return both body text and links.
```

Expected: `read_url include_links=true` with status, body, links, and structured fields.

### 5. JavaScript Page

```text
Use only the net-tools browser to open a JavaScript page and read its rendered title and body. Do not switch to built-in Fetch if normal HTTP output is empty.
```

Expected: `browser_interact action=read`.

### 6. Search Screenshot

```text
Use only net-tools to search for BERT in a real browser, capture the results page, and report the first three sources from the image and extracted results. Open original sources before making important claims.
```

Expected: `browser_interact action=screenshot` returns text and an image, followed by `read_url` for source verification.

## Development Regression

```powershell
npm test
```

Local fixtures test both Node and Python for:

- The three-tool compact profile and full compatibility profile.
- Node/Python schema parity.
- Structured content from `web_search`, `read_url`, and `browser_interact`.
- Long HTML beyond the old 1.2 MB limit.
- No extra server request for second-page HTML/PDF continuation.
- PDF extraction, arXiv 429 cooldown, browser mocks, HTTP sessions, links, and anti-bot diagnostics.

With a real Playwright browser installed:

```powershell
npm run test:browser-live
```

This command launches a real browser and is intended only for local development verification.