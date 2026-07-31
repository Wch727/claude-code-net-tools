# Claude Code Net Tools

[中文](README.md)

A local web-access MCP for Claude Code. It addresses a specific problem: Claude Code's built-in search may be unavailable, built-in `Fetch/WebFetch` may reject a domain, free search endpoints may be unreliable, or the task may require long documents, PDFs, or JavaScript-rendered pages.

This project does not contain an LLM and does not answer questions by itself. Claude Code understands the request, prepares queries, and synthesizes the answer; this MCP performs network requests and returns sources and document content.

## Three Default Tools

| Tool | Purpose |
| --- | --- |
| `web_search` | Search the web, papers, code, news, or official sources. Accepts one primary query and up to two alternatives. |
| `read_url` | Read HTML, text, JSON, RSS/Atom, and PDF. The first call creates a document snapshot; later calls continue with `document_id + offset` without downloading again. |
| `browser_interact` | Use Playwright for real search pages, JavaScript pages, screenshots, clicks, typing, scrolling, downloads, and network responses. |

Only these three are listed by default so Claude Code has fewer overlapping choices. Legacy interfaces such as `search_web`, `fetch_url`, `fetch_pdf`, and `browser_fetch` remain available. Set `CLAUDE_NET_TOOL_PROFILE=full` and restart Claude Code to list all compatibility tools.

## How It Works

1. Claude Code interprets the request and prepares queries. A standalone CJK name or exact entity is preserved without adding filler such as “who is” or “profile”; the tool also extracts that entity first when such filler was supplied.
2. `web_search` obtains candidate sources from free providers, optional search APIs, or browser search.
3. Claude Code selects a source and calls `read_url`.
4. `read_url` downloads and extracts one complete bounded snapshot, then returns only the requested `max_chars` window.
5. When `next_offset` is present, Claude Code continues with the same `document_id`. Continuation reads memory and does not repeat the HTTP request or `pdftotext` extraction.
6. If normal HTTP reading fails, JavaScript is required, or visual layout matters, Claude Code uses `browser_interact`.

By default the process keeps up to 12 snapshots, 80 million total characters, for one hour. Snapshots exist only in the MCP process memory; restarting Claude Code or the MCP requires reading the URL again.

## Installation

### 1. Requirements

Recommended Node build:

- Claude Code: `claude --version`
- Node.js 20 or newer: `node -v`
- curl: `curl --version`; Windows 10/11 normally includes `curl.exe`

Basic search and HTTP reading do not require `npm install`.

The Python fallback requires Python 3.10 or newer and uses only the standard library, so it does not require `pip install`. Python supports HTTP(S) proxies; use the Node/curl build for SOCKS proxies.

Optional dependencies:

- PDF text: install Poppler `pdftotext`, make `pdftotext -v` work, or set `CLAUDE_NET_PDFTOTEXT` to its executable path.
- Browser features: Node.js/npm plus Playwright CLI, installed below.

### 2. Clone and Register

```powershell
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
.\scripts\install-claude-code.ps1 -Scope user
```

macOS/Linux:

```bash
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
./scripts/install-claude-code.sh --scope user
```

Use `user` for every project or `local` for only the current project. Add `-Force` (`--force` on macOS/Linux) after moving the repository, changing settings, or upgrading.

On Windows, the installer prefers a windowless launcher so MCP calls do not flash a console. Add `-ShowConsole` when diagnosing startup errors.

### 3. Verify and Restart

```powershell
claude mcp get net-tools
```

The output should contain `Status: Connected`, `Type: stdio`, and an entry path in this repository. Fully restart VS Code/Claude Code and open a new session; an existing session does not reload MCP tools or instructions.

## Use It Like This

```text
Use only net-tools for web access. Search for "Who is Ye Lanfeng?", open at least two independent sources, then answer with source links.
```

```text
Use net-tools to find the original BERT paper, read its abstract and conclusion, and report its title, authors, year, and main contribution.
```

```text
Use net-tools to read this long document. If next_offset is returned, continue with document_id until you have covered the relevant sections.
```

```text
Use net-tools to search for BERT in a real browser, capture the results page, and open the original paper to verify the answer.
```

The complete search policy is embedded in the MCP initialization instructions and the three primary tool descriptions. It takes effect in a new Claude Code session after installation; no prompt copying or `CLAUDE.md` edit is required. [prompts](prompts/README.en.md) now keeps Chinese and English reference copies only.

## Long Pages and PDFs

`read_url` permits a 20 MB document snapshot by default and returns 12,000 characters per call by default. These are separate limits:

- `max_bytes` limits the first download. Default 20 MB, maximum 50 MB.
- `max_chars` limits text returned to Claude Code in one call. Default 12,000.
- `next_offset` means more extracted content remains.
- `document_id` identifies the existing snapshot; continuation does not contact the website again.

PDF text comes from `pdftotext`. It is useful for abstracts, body text, and references, but formulas, tables, multi-column layout, and images can still be disordered. Use a PDF viewer or `browser_interact action=screenshot` when derivations or visual layout matter.

For arXiv URLs, failed/non-PDF downloads or failed automatic extraction can fall back to ar5iv HTML. Set `html_fallback=false` to disable this.

## Playwright Browser

Before first use:

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

Claude Code can then use one browser interface:

- `browser_interact action=search`: render Google, Bing, or DuckDuckGo and extract results.
- `action=read`: read JavaScript-rendered content.
- `action=screenshot`: return an image plus extractable page text.
- `action=open|snapshot|click|type|wait|scroll|extract|download|network|close`: operate a complex page through a named session.

Browser mode does not bypass login, captcha, paywall, or authorization. When a challenge page is detected, the tool reports that Playwright works but the page requires verification instead of returning the challenge as content. For manual login/captcha with a dedicated profile:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

Do not point the profile at an everyday Chrome profile that is currently open.

## Network and Proxies

The default route scans common local proxy ports and then tries direct access. Pin a proxy:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy http://127.0.0.1:7890
```

Force direct access and disable local-port probing:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy direct
```

The Node/curl build supports HTTP, HTTPS, and `socks5h://`; Python supports HTTP(S).

## Search Providers and API Keys

Free providers work without a key. Optional providers include Kimi/Moonshot, MiniMax, Brave, Serper, and Tavily. Keys are read only from environment variables; never put them in the repository, README, MCP arguments, or commit history.

Windows Tavily example:

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "your-key", "User")
.\scripts\install-claude-code.ps1 -Scope user -Force -Providers tavily,bing_rss,duckduckgo
```

Fully restart VS Code/Claude Code afterward. Setting a key alone does not make API calls; the corresponding provider must be in the configured order or explicitly requested. See [Configuration and API Keys](docs/config.en.md) for every variable.

## Troubleshooting

### Claude Code still uses built-in Fetch and rejects the domain

That message comes from Claude Code's built-in reader, not net-tools. Upgrade, open a new session, and state:

```text
Use net-tools only for external search and URL reading. Do not use built-in Fetch, WebFetch, or WebSearch.
```

### Continuation contacts the website again

Call `read_url` with the exact `document_id` and `next_offset` from the previous result. Do not pass only the URL. A snapshot expires after its TTL or an MCP restart by design.

### Legacy tool names are needed

On Windows:

```powershell
[Environment]::SetEnvironmentVariable("CLAUDE_NET_TOOL_PROFILE", "full", "User")
```

Restart Claude Code. Change the value to `compact` or remove it to restore the three-tool list.

### Search is empty or slow

Search a full CJK name verbatim before adding “who is”, “profile”, or similar filler. For broader topics, add English names, organizations, years, paper titles, or official-site terms. Free engines may rate-limit or require a captcha; use `browser_interact action=search`, change providers, or configure a search API.

## Documentation

- [Configuration, environment variables, and API keys](docs/config.en.md)
- [Three main tools, compatibility tools, and limits](docs/tools.en.md)
- [Tests and smoke-test prompts](docs/testing.en.md)
- [Built-in Claude Code search policy](prompts/README.en.md)

Development verification:

```powershell
npm test
```

The test suite starts both Node and Python MCP implementations and verifies tool profiles, structured results, long-page snapshots, PDF continuation, browser mocks, sessions, and search providers without contacting real search engines.