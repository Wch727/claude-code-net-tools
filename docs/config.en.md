# Configuration And API Keys

[中文](config.zh.md) · [Back to README](../README.en.md)

## Requirements

Recommended Node/curl build:

- Node.js 20 or newer. Check with `node -v`.
- curl/curl.exe. Windows 10/11 usually includes `curl.exe`; macOS/Linux can check `curl --version`.
- No `npm install` is required by default. The code uses only Node built-ins and system curl.

Python fallback:

- Python 3.10 or newer. Check with `python --version`.
- No `pip install` is required by default. The code uses only the Python standard library.
- Python stdlib supports HTTP(S) proxies; use the Node/curl build for SOCKS proxies.

Optional:

- Poppler `pdftotext`: used by `fetch_pdf`. Put it on PATH or set `CLAUDE_NET_PDFTOTEXT`.
- Search API keys: pass only through environment variables such as `KIMI_API_KEY`, `MINIMAX_API_KEY`, `BRAVE_SEARCH_API_KEY`, `SERPER_API_KEY`, and `TAVILY_API_KEY`.

## MCP Config Example

```json
{
  "mcpServers": {
    "net-tools": {
      "command": "node",
      "args": ["C:\\path\\to\\claude-code-net-tools\\claude_net_mcp.mjs"],
      "env": {
        "CLAUDE_NET_PROXY": "http://127.0.0.1:7890"
      }
    }
  }
}
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `CLAUDE_NET_PROXY` | Force the route. Supports `http://`, `https://`, `socks5h://` in the Node/curl build, or `direct`. |
| `CLAUDE_NET_HTTP_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Proxy fallback when `CLAUDE_NET_PROXY` is not set. |
| `CLAUDE_NET_PROXY_PORTS` | Local ports to auto-detect when no proxy is pinned, for example `7890,7897,1080`. |
| `CLAUDE_NET_SEARCH_PROVIDERS` | Override web-search provider order, for example `kimi,minimax,duckduckgo,bing_rss`. |
| `CLAUDE_NET_SCHOLAR_PROVIDERS` | Override scholar-search provider order, for example `crossref,semantic_scholar,arxiv`. |
| `CLAUDE_NET_DISABLED_PROVIDERS` | Disable providers, for example `duckduckgo,bing_html,arxiv`. |
| `CLAUDE_NET_PROVIDER_FAIL_LIMIT` | Consecutive provider failures before automatic skip. Default `3`. |
| `CLAUDE_NET_ARXIV_COOLDOWN_MS` | Cooldown after arXiv returns HTTP 429. Default `5000` ms. |
| `CLAUDE_NET_DEFAULT_MAX_CHARS` | Default `fetch_url` character output. Default `12000`. |
| `CLAUDE_NET_MAX_OUTPUT_CHARS` | Maximum characters returned by one tool call. Default `200000`. |
| `CLAUDE_NET_MAX_FETCH_BYTES` | Maximum bytes downloaded by one fetch call. |
| `CLAUDE_NET_COOKIE_DIR` | Cookie jar directory. |
| `CLAUDE_NET_SESSION_DIR` | Named session JSON directory. |
| `CLAUDE_NET_CURL` | Custom curl path for the Node/curl build. |
| `CLAUDE_NET_PDFTOTEXT` | Custom `pdftotext` path. |
| `CLAUDE_NET_DEBUG` | Print more detailed error messages. |

Advanced/testing: `CLAUDE_NET_ARXIV_API_URL` overrides the arXiv API endpoint. Normal users should leave it unset.

## API Keys

API keys are read only from environment variables. Do not write them into code, README files, commit history, or public repositories.

| Provider | Required environment variable | Optional environment variables |
| --- | --- | --- |
| `kimi` | `KIMI_API_KEY` or `MOONSHOT_API_KEY` | `KIMI_BASE_URL`, `KIMI_MODEL` |
| `minimax` | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL`, `MINIMAX_MODEL`, `MINIMAX_WEB_SEARCH_TOOL` |
| `brave` | `BRAVE_SEARCH_API_KEY` | - |
| `serper` | `SERPER_API_KEY` or `GOOGLE_SERPER_API_KEY` | - |
| `tavily` | `TAVILY_API_KEY` | - |

Setting a key alone does not force paid API usage. Defaults still prefer free providers; to use API providers, set `CLAUDE_NET_SEARCH_PROVIDERS` or pass `providers` in a single tool call.

## Provider Strategy

Web search and scholar search use separate provider order settings:

- `CLAUDE_NET_SEARCH_PROVIDERS` controls `search_web` and `search_web_focused`.
- `CLAUDE_NET_SCHOLAR_PROVIDERS` controls `scholar_search`.
- `CLAUDE_NET_DISABLED_PROVIDERS` applies to both groups.

`scholar_search` defaults to `crossref,semantic_scholar,arxiv`. arXiv rate-limits repeated requests from the same exit IP; after HTTP 429, the tool enters cooldown and does not keep sending arXiv variants.