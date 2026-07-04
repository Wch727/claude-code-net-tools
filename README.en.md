# Claude Code Net Tools

[中文](README.md)

Claude Code Net Tools is a local MCP server that gives Claude Code configurable web search, URL fetching, and content extraction tools.

## What Problem It Solves

When Claude Code is connected to external models/APIs, local proxies/VPNs, corporate proxies, or free search pages, built-in web search may be unavailable, unstable, or limited to official Claude accounts and specific model/tool combinations. This project moves search/fetching into a local MCP layer: Claude Code handles intent and query rewriting, while the local tool handles search execution, page fetching, JSON/RSS/PDF reading, and route/provider control through environment variables.

Use it in compliance with local laws, site rules, and your organization's security requirements. This tool provides technical access only; it does not bypass login, captcha, or authorization controls.

## Quick Start

```powershell
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
claude mcp add net-tools node C:\path\to\claude-code-net-tools\claude_net_mcp.mjs
```

The recommended Node/curl build needs Node.js 20+ and system `curl`/`curl.exe`. It does not need `npm install` by default. Python fallback:

```powershell
claude mcp add net-tools-py python C:\path\to\claude-code-net-tools\claude_net_mcp.py
```

With a proxy/VPN:

```powershell
claude mcp add net-tools -e CLAUDE_NET_PROXY=http://127.0.0.1:7890 -- node C:\path\to\claude-code-net-tools\claude_net_mcp.mjs
```

If you do not need a proxy, leave `CLAUDE_NET_PROXY` unset or set it to `direct`.

## Common Tools

- `search_web`: basic web search that preserves provider order and leaves intent judgment to the LLM.
- `search_web_focused`: explicit assisted search for noisy results.
- `scholar_search`: paper search through Crossref, Semantic Scholar, and arXiv.
- `package_search`: npm, PyPI, and GitHub repository search.
- `fetch_url` / `extract_links` / `fetch_json` / `fetch_rss` / `fetch_pdf`: fetch webpages, links, JSON, RSS/Atom, and PDFs.
- `session_create` / `session_status` / `session_clear`: named HTTP sessions with default headers/cookies/referer and a dedicated cookie jar.
- `proxy_status` / `search_status` / `pdf_status`: diagnose routes, provider status, and PDF extraction.

## Documentation

- [Configuration and API keys](docs/config.en.md)
- [Tools and limits](docs/tools.en.md)
- [Testing, smoke prompts, and development checks](docs/testing.en.md)
- [Claude Code search prompt guide](prompts/README.en.md)

## Minimal Verification

```powershell
npm test
```

`npm test` starts an offline fixture and tests both the Node/curl and Python builds through MCP JSON-RPC. It does not download dependencies.