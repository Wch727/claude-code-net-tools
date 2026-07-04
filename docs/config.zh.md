# 配置和 API key

[English](config.en.md) · [返回首页](../README.md)

## 安装要求

Node/curl 版推荐：

- Node.js 20 或更新版本，用 `node -v` 检查。
- curl/curl.exe。Windows 10/11 通常自带 `curl.exe`；macOS/Linux 用 `curl --version` 检查。
- 默认不需要 `npm install`，代码只使用 Node 内置模块和系统 curl。

Python 备用版：

- Python 3.10 或更新版本，用 `python --version` 检查。
- 默认不需要 `pip install`，代码只使用 Python 标准库。
- Python 标准库只支持 HTTP(S) 代理；SOCKS 代理建议用 Node/curl 版。

可选：

- Poppler `pdftotext`：用于 `fetch_pdf` 提取 PDF 文本。安装后放进 PATH，或设置 `CLAUDE_NET_PDFTOTEXT`。
- 搜索 API key：只通过环境变量传入，例如 `KIMI_API_KEY`、`MINIMAX_API_KEY`、`BRAVE_SEARCH_API_KEY`、`SERPER_API_KEY`、`TAVILY_API_KEY`。

## MCP 配置示例

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

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `CLAUDE_NET_PROXY` | 强制网络出口。支持 `http://`、`https://`、`socks5h://`（Node/curl 版）或 `direct`。 |
| `CLAUDE_NET_HTTP_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | 未设置 `CLAUDE_NET_PROXY` 时的代理回退。 |
| `CLAUDE_NET_PROXY_PORTS` | 未指定代理时自动探测的本地端口列表，例如 `7890,7897,1080`。 |
| `CLAUDE_NET_SEARCH_PROVIDERS` | 覆盖网页搜索 provider 顺序，例如 `kimi,minimax,duckduckgo,bing_rss`。 |
| `CLAUDE_NET_SCHOLAR_PROVIDERS` | 覆盖学术搜索 provider 顺序，例如 `crossref,semantic_scholar,arxiv`。 |
| `CLAUDE_NET_DISABLED_PROVIDERS` | 禁用指定 provider，例如 `duckduckgo,bing_html,arxiv`。 |
| `CLAUDE_NET_PROVIDER_FAIL_LIMIT` | provider 连续失败多少次后自动跳过，默认 `3`。 |
| `CLAUDE_NET_ARXIV_COOLDOWN_MS` | arXiv 返回 429 后的冷却时间，默认 `5000` 毫秒。 |
| `CLAUDE_NET_DEFAULT_MAX_CHARS` | `fetch_url` 默认返回字符数，默认 `12000`。 |
| `CLAUDE_NET_MAX_OUTPUT_CHARS` | 单次工具输出的最大字符数，默认 `200000`。 |
| `CLAUDE_NET_MAX_FETCH_BYTES` | 单次下载最大字节数。 |
| `CLAUDE_NET_COOKIE_DIR` | cookie jar 存储目录。 |
| `CLAUDE_NET_SESSION_DIR` | named session JSON 存储目录。 |
| `CLAUDE_NET_CURL` | Node/curl 版自定义 curl 路径。 |
| `CLAUDE_NET_PDFTOTEXT` | 自定义 `pdftotext` 路径。 |
| `CLAUDE_NET_DEBUG` | 输出更详细的错误信息。 |

高级/测试用：`CLAUDE_NET_ARXIV_API_URL` 可覆盖 arXiv API endpoint；普通用户保持未设置。

## API key

API key 只从环境变量读取，不要写进代码、README、提交记录或公开仓库。

| Provider | 必填环境变量 | 可选环境变量 |
| --- | --- | --- |
| `kimi` | `KIMI_API_KEY` 或 `MOONSHOT_API_KEY` | `KIMI_BASE_URL`、`KIMI_MODEL` |
| `minimax` | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`MINIMAX_WEB_SEARCH_TOOL` |
| `brave` | `BRAVE_SEARCH_API_KEY` | - |
| `serper` | `SERPER_API_KEY` 或 `GOOGLE_SERPER_API_KEY` | - |
| `tavily` | `TAVILY_API_KEY` | - |

只配置 key 不等于一定会调用付费 API。默认搜索仍优先免费 provider；要让 API provider 参与搜索，需要设置 `CLAUDE_NET_SEARCH_PROVIDERS`，或在单次工具调用里传 `providers`。

## Provider 策略

网页搜索和学术搜索是两套顺序：

- `CLAUDE_NET_SEARCH_PROVIDERS` 控制 `search_web` 和 `search_web_focused`。
- `CLAUDE_NET_SCHOLAR_PROVIDERS` 控制 `scholar_search`。
- `CLAUDE_NET_DISABLED_PROVIDERS` 对两类 provider 都生效。

`scholar_search` 默认 `crossref,semantic_scholar,arxiv`。arXiv 对同一出口 IP 有频率限制；遇到 429 后工具会短暂冷却，不会继续连发多种 arXiv 请求。