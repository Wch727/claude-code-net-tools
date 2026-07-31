# Claude Code Net Tools

[中文](README.md)

Claude Code Net Tools is a local MCP server that adds web search, URL fetching, rendered-page reading, screenshots, and JSON/RSS/PDF extraction to Claude Code.

It does not contain an LLM and does not answer questions by itself. The actual flow is:

1. Claude Code understands the request and chooses a `net-tools` tool.
2. This server performs the request through the local network, a proxy, or a configured search API.
3. The tool returns search results or page content to Claude Code.
4. Claude Code reads the sources and writes the answer.

This is intended for cases where Claude Code can chat normally but its built-in web features are unavailable or unreliable for the current account, model, or network. It does not replace or modify Claude Code's built-in `WebSearch`/`Fetch`; explicitly ask for `net-tools` when needed.

## What It Can and Cannot Do

It can:

- Search free public endpoints or search APIs configured by the user.
- Use a local proxy/VPN; when none is specified, probe common local proxy ports and then try a direct connection.
- Fetch webpages, JSON, RSS/Atom, and PDFs.
- Use Playwright to render JavaScript, click, type, capture screenshots, and inspect XHR/fetch responses.
- Keep named HTTP sessions with headers, cookies, referer, and a dedicated cookie jar.

It cannot:

- Bypass logins, captchas, paywalls, or authorization.
- Guarantee that public search engines will never rate-limit or challenge automation.
- Preserve formulas, tables, and complex PDF layout like a PDF reader.
- Decide whether a source is trustworthy; factual answers should still be checked against source pages.

Follow applicable laws, target-site rules, and organizational security requirements.

## Installation

### 1. Prerequisites

The recommended Node build requires:

- Claude Code, with `claude --version` working in a terminal.
- Node.js 20 or newer, with `node -v` working.
- System `curl`, with `curl --version` working. Windows 10/11 normally includes `curl.exe`.

No `npm install` is required by default. PDF text extraction and browser support have separate optional dependencies described below.

### 2. Clone the Repository

```powershell
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
```

### 3. Register It with Claude Code

On Windows, user scope is recommended so the tools are available in every project:

```powershell
.\scripts\install-claude-code.ps1 -Scope user
```

On macOS/Linux:

```bash
./scripts/install-claude-code.sh --scope user
```

Use `local` instead of `user` to limit the server to the current project. After moving the repository or changing install options, add `-Force` (`--force` on macOS/Linux) to register it again.

Use a fixed proxy:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy http://127.0.0.1:7890
```

Force a direct connection without probing local proxy ports:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy direct
```

On Windows, when `pythonw.exe` is available, the installer uses it as a windowless launcher while still running the full Node build. This only prevents VS Code/Claude Code from flashing a console when it starts the MCP server. Add `-ShowConsole` when startup-window debugging is needed.

### 4. Verify the Installation

Run:

```powershell
claude mcp get net-tools
```

The output should show:

- A `Status` line containing `Connected`
- `Type: stdio`
- An entry file pointing to this repository's `claude_net_mcp.mjs`

Open a new Claude Code session and enter:

```text
Use only net-tools. Call net_doctor with live=true and query "Claude Code MCP", then explain whether each check succeeded.
```

`net_doctor` checks configuration only unless `live=true` is supplied. After this succeeds, normal questions do not require hand-written tool arguments.

## Everyday Usage

Tell Claude Code to use `net-tools` and describe the task:

```text
Use net-tools to find out who Ye Lanfeng is. Open at least two independent sources before answering and include source links.
```

```text
Use net-tools to find the original BERT paper. Search first, open the paper or abstract page, and report its title, authors, year, and main contribution.
```

```text
Open this URL with net-tools. If the normal fetch has no body, use browser_fetch to read the JavaScript-rendered page.
```

```text
Search for BERT in a browser with net-tools and use browser_screenshot so you can inspect both the result list and any knowledge panel.
```

Claude Code prepares queries and tool arguments itself. Specify providers, timeouts, or browser modes only when debugging specific behavior.

## Which Tool to Use

| Need | Tool | Behavior |
| --- | --- | --- |
| General web search | `search_web` | Main search entry point; merges several queries and providers. |
| Noisy search results | `search_web_focused` | Can clean the query and filter weak matches; not recommended as the default. |
| Papers | `scholar_search` | Searches Crossref, Semantic Scholar, and arXiv. |
| npm/PyPI/GitHub projects | `package_search` | Searches package registries or GitHub repositories. |
| A known webpage URL | `fetch_url` | Downloads the page and extracts readable text, with pagination and optional links. |
| JSON or RSS | `fetch_json` / `fetch_rss` | Preserves structure and formats the response. |
| PDF | `fetch_pdf` | Downloads and pages through PDF text; arXiv failures can fall back to HTML. |
| Browser search page | `browser_search` | Opens Google/Bing/DuckDuckGo and extracts results in page order. |
| JavaScript-rendered page | `browser_fetch` | Runs page JavaScript in Playwright before reading the body. |
| Layout, charts, or images | `browser_screenshot` | Returns both page text and a screenshot. |
| Click, type, load more, or capture an API call | `browser_action` | Performs consecutive actions in one named browser session. |
| Diagnose a failure | `net_doctor` / `proxy_status` / `search_status` / `browser_status` / `pdf_status` | Checks the whole setup, route, providers, browser, or PDF extractor. |

When both page text and links are needed, use `fetch_url include_links=true` instead of calling `extract_links` separately.

## Search Result Order

`search_web` does not call another model to score results and does not apply heuristic relevance reranking by default. The approximate process is:

1. Claude Code supplies one main query and up to two alternatives.
2. The server searches providers in configured order.
3. Duplicate URLs are removed.
4. Results are merged round-robin across queries/providers so one source does not occupy every position.

The first result is therefore not guaranteed to be the most authoritative or correct. For reliable answers, ask Claude Code to open several independent sources. `verify_top` checks reachability, final URL, title, and body length; it does not change result order.

Without `CLAUDE_NET_SEARCH_PROVIDERS`, the default order is `bing_rss,duckduckgo,bing_html` for non-CJK queries and `bing_rss,bing_html,sogou,so360,duckduckgo` for CJK queries. Unavailable or repeatedly failing providers are skipped.

`intent=academic` routes to paper providers. `intent=code` routes to GitHub/npm/PyPI. People, events, and general concepts normally use `general`.

## Browser Support

Browser support is optional. Before first use:

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

Then check it from Claude Code:

```text
Use net-tools to call browser_status with live=true.
```

The default browser is headless: no window is shown, but `browser_screenshot` can still return an image. A visible browser is used only when the server was installed with `-BrowserHeaded`, for example to complete a captcha manually and reuse an isolated profile:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

Do not point the profile at an everyday Chrome profile that is currently open. Public search engines may still block fresh headless browsers. Browser mode complements HTTP search/fetch when rendering is required; it is not a guaranteed higher-quality search API.

`search_web`, `search_web_focused`, and `fetch_url` accept `browser=never|auto|always`. The default `auto` starts a browser only when normal search has too few results or independent sources, HTTP fetch fails, an anti-bot page is detected, or the response is a JavaScript shell. `never` disables fallback; `always` forces browser use.

## Search APIs (Optional)

Free providers work without an API key. Kimi/Moonshot, MiniMax, Brave, Serper, and Tavily are supported. Keys are read only from environment variables; the repository and installer do not contain, upload, or save them.

For example, configure Tavily in the Windows user environment:

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "your-key", "User")
.\scripts\install-claude-code.ps1 -Scope user -Force -Providers tavily,bing_rss,duckduckgo
```

Fully restart VS Code/Claude Code so the new process reads the environment variable. Remove the key with:

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", $null, "User")
```

For this tool, merely setting a key does not call the API. Calls and charges are possible only when the provider is included in the configured order or explicitly selected in a tool call. See [Configuration and API keys](docs/config.en.md) for other variable names and base URLs.

## PDF Support

`fetch_pdf` can download a PDF without extra dependencies. Plain-text extraction requires Poppler `pdftotext` on PATH, or an explicit `CLAUDE_NET_PDFTOTEXT` path.

Long papers are returned in chunks. When the result includes `next_offset`, call `fetch_pdf` again with the same PDF URL and set `offset` to that value. `max_chars` limits only the current response; it no longer limits how much text `pdftotext` may extract.

For an arXiv URL, the tool defaults to the readable ar5iv HTML paper when the PDF is rate-limited, is not actually a PDF, or automatic extraction fails. Set `html_fallback=false` to disable this behavior. Plain text and HTML are useful for abstracts, introductions, conclusions, and references; use a PDF reader for formulas, tables, derivations, or layout-sensitive material.

## Troubleshooting

### Status Is Not `Connected`

```powershell
claude mcp get net-tools
.\scripts\install-claude-code.ps1 -Scope user -Force
```

Open a new Claude Code session. If `Conflicting scopes` appears, use `claude mcp list` to locate duplicate entries and keep only one scope.

### A Black Console Flashes on Every Call

On Windows, run `claude mcp get net-tools`. If `Command` is `pythonw.exe`, the windowless launcher is enabled. An old session may still keep the old process, so fully restart VS Code. Without `pythonw.exe`, the tools still work, but some GUI hosts may expose the Node console.

### A White Browser Window Appears

The server was usually installed with `-BrowserHeaded`. To return to background browser mode:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force
```

### Search Returns Nothing or Is Slow

Ask Claude Code to call `proxy_status`, then `search_status live=true`. If a free provider is rate-limited, change provider order temporarily or configure a search API. When arXiv returns HTTP 429, the server cools down and continues with Crossref/Semantic Scholar.

### Claude Code's Built-in `Fetch` Says a Domain Is Unsafe

That check belongs to Claude Code's built-in fetcher, not this project. Since 0.11.0, the MCP initialization response tells Claude Code to stay with `net-tools`, use `browser_fetch` after a normal page fails, and not switch back to built-in `Fetch/WebFetch`. Open a new Claude Code session after upgrading; an existing session does not reload the server instructions.

If a new session still selects built-in `Fetch`, state: "Use only `net-tools fetch_url` for external pages, use `net-tools browser_fetch` for dynamic or blocked pages, and do not use built-in Fetch/WebFetch."

### A Long Page or Paper Is Truncated

When `fetch_url`, `browser_fetch`, or `fetch_pdf` returns `next_offset`, request the same URL again with `offset` set to that value. `max_chars` controls one response chunk, not the full download or extraction limit.

## Python Fallback

The Python 3.10+ fallback uses only the standard library and does not need `pip install`:

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Runtime python -Force
```

The Python build supports HTTP(S) proxies only. The Node/curl build is recommended for SOCKS proxies and the main Windows setup. Browser support in the Python build still requires Node.js/npm.

## Documentation

- [Configuration, environment variables, and API keys](docs/config.en.md)
- [All tool parameters and limits](docs/tools.en.md)
- [Testing, smoke prompts, and development checks](docs/testing.en.md)
- [Claude Code search prompts](prompts/README.en.md)

## Development Verification

```powershell
npm test
```

This command uses local fixtures to test both MCP implementations without contacting real search engines. With a Playwright browser installed, `npm run test:browser-live` performs a real browser-process test and is intended for development only.
