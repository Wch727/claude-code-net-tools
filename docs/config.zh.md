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

- Poppler `pdftotext`：用于 `read_url` 读取 PDF，也用于旧版 `fetch_pdf`。安装后放进 PATH，或设置 `CLAUDE_NET_PDFTOTEXT`。
- 搜索 API key：只通过环境变量传入，例如 `KIMI_API_KEY`、`MINIMAX_API_KEY`、`BRAVE_SEARCH_API_KEY`、`SERPER_API_KEY`、`TAVILY_API_KEY`。

## 安装脚本

在仓库根目录里，最简单的 Claude Code 安装方式是：

```powershell
.\scripts\install-claude-code.ps1
```

macOS/Linux：

```bash
./scripts/install-claude-code.sh
```

常用选项：

```powershell
.\scripts\install-claude-code.ps1 -Proxy http://127.0.0.1:7890
.\scripts\install-claude-code.ps1 -Proxy direct
.\scripts\install-claude-code.ps1 -Providers bing_rss,duckduckgo,bing_html
.\scripts\install-claude-code.ps1 -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
.\scripts\install-claude-code.ps1 -Runtime python
.\scripts\install-claude-code.ps1 -Scope user
.\scripts\install-claude-code.ps1 -Force
```

脚本只负责把 MCP server 注册到 Claude Code，不安装依赖，也不会写入 API key。默认写入 `local` scope，可用 `-Scope local|user|project` 明确选择。移动仓库路径、切换 runtime、修改网络出口或 provider 环境变量后，重新运行即可。

同名 `net-tools` 不要同时注册在多个 scope。若 `claude mcp list` 报 `Conflicting scopes`，先决定保留哪一项，再删除另一项，例如 `claude mcp remove net-tools -s user` 或 `claude mcp remove net-tools -s project`；安装脚本不会擅自删除其他 scope 的配置。

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
| `CLAUDE_NET_SEARCH_PROVIDERS` | 覆盖网页搜索 provider 顺序，例如 `bing_rss,duckduckgo,bing_html`。 |
| `CLAUDE_NET_SEARCH_BUDGET` | `web_search`/`search_web` 默认总时间预算秒数，默认 `30`，单次调用可用 `time_budget` 覆盖。 |
| `CLAUDE_NET_SCHOLAR_PROVIDERS` | 覆盖学术搜索 provider 顺序，例如 `crossref,semantic_scholar,arxiv`。 |
| `CLAUDE_NET_DISABLED_PROVIDERS` | 禁用指定 provider，例如 `duckduckgo,bing_html,arxiv`。 |
| `CLAUDE_NET_PROVIDER_FAIL_LIMIT` | provider 连续失败多少次后自动跳过，默认 `3`。 |
| `CLAUDE_NET_ARXIV_COOLDOWN_MS` | arXiv 返回 429 后的冷却时间，默认 `5000` 毫秒。 |
| `CLAUDE_NET_DEFAULT_MAX_CHARS` | `read_url`/`fetch_url` 默认返回字符数，默认 `12000`。 |
| `CLAUDE_NET_MAX_OUTPUT_CHARS` | 单次工具输出的最大字符数，默认 `200000`。 |
| `CLAUDE_NET_MAX_FETCH_BYTES` | 旧版 `fetch_url` 未传单次上限时的默认下载字节数。 |
| `CLAUDE_NET_TOOL_PROFILE` | `compact`（默认）只显示 `web_search`、`read_url`、`browser_interact`；`full` 显示全部兼容工具。修改后需重启 Claude Code。 |
| `CLAUDE_NET_SNAPSHOT_MAX_BYTES` | `read_url` 首次下载的默认上限。默认 `20000000`，范围 1.2-50 MB。 |
| `CLAUDE_NET_DOCUMENT_CACHE_TTL_MS` | 进程内文档快照有效期。默认 `3600000`（1 小时）。 |
| `CLAUDE_NET_DOCUMENT_CACHE_MAX_DOCS` | 进程内最多保留的文档快照数。默认 `12`。 |
| `CLAUDE_NET_DOCUMENT_CACHE_MAX_TOTAL_CHARS` | 所有快照最多保留的提取字符总数。默认 `80000000`。 |
| `CLAUDE_NET_COOKIE_DIR` | cookie jar 存储目录。 |
| `CLAUDE_NET_SESSION_DIR` | named session JSON 存储目录。 |
| `CLAUDE_NET_CURL` | Node/curl 版自定义 curl 路径。 |
| `CLAUDE_NET_PDFTOTEXT` | 自定义 `pdftotext` 路径。 |
| `CLAUDE_NET_DEBUG` | 输出更详细的错误信息。 |

高级/测试用：`CLAUDE_NET_ARXIV_API_URL` 可覆盖 arXiv API endpoint；`CLAUDE_NET_ARXIV_HTML_BASE` 可覆盖 `fetch_pdf` 的 arXiv HTML 回退地址，默认 `https://ar5iv.labs.arxiv.org/html/`。普通用户保持未设置。

## Playwright 浏览器配置

浏览器模式需要 Node.js/npm 提供的 `npx`。首次使用前运行：

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

Python 版也通过同一个 Playwright CLI 启动浏览器，因此启用浏览器功能时仍需要 Node.js/npm。HTTP 模式不需要 Playwright。

最接近日常浏览器的配置是使用本机 Chrome/Edge、专用持久化 profile 和可见窗口。不要直接指定正在运行的日常浏览器 profile；建议创建隔离目录。搜索站点要求验证码时，可在可见窗口中手动完成，之后工具复用该 profile 的 cookie：

```powershell
.\scripts\install-claude-code.ps1 -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

若不希望显示窗口，去掉 `-BrowserHeaded`；但全新无头浏览器更容易触发公共搜索引擎的机器人验证。

| 变量 | 作用 |
| --- | --- |
| `CLAUDE_NET_BROWSER_FALLBACK` | 默认浏览器策略：`never`、`auto` 或 `always`，默认 `auto`。 |
| `CLAUDE_NET_BROWSER_ENGINE` | `browser_interact action=search engine=auto` 时优先尝试的引擎，默认 `google`。 |
| `CLAUDE_NET_BROWSER` | 可选浏览器通道：`chrome`、`msedge`、`firefox` 或 `webkit`。 |
| `CLAUDE_NET_BROWSER_PROFILE` | 可选的专用持久化 profile 目录，用于保留浏览器 cookie/登录状态。不要指向正在运行的日常浏览器 profile。 |
| `CLAUDE_NET_BROWSER_HEADED` | 设为 `1`/`true` 时显示浏览器窗口。 |
| `CLAUDE_NET_BROWSER_TIMEOUT` | 浏览器命令超时秒数，默认 `35`。 |
| `CLAUDE_NET_BROWSER_CACHE_TTL_MS` | 浏览器搜索缓存时间，默认 `300000` 毫秒。 |
| `CLAUDE_NET_BROWSER_WORK_DIR` | Playwright 快照/会话临时目录；默认使用系统临时目录，不污染 Claude Code 项目。 |
| `CLAUDE_NET_MAX_SCREENSHOT_BYTES` | `browser_interact action=screenshot` 和旧版 `browser_screenshot` 返回图片的最大字节数，默认 `5000000`；超限时会优先退回压缩后的当前视口 JPEG。 |
| `CLAUDE_NET_PLAYWRIGHT_COMMAND` | 高级配置：自定义 `playwright-cli` 可执行命令。 |

## API key

API key 只从环境变量读取，不要写进代码、README、提交记录或公开仓库。

| Provider | 必填环境变量 | 可选环境变量 |
| --- | --- | --- |
| `kimi` | `KIMI_API_KEY` 或 `MOONSHOT_API_KEY` | `KIMI_BASE_URL`、`KIMI_MODEL` |
| `minimax` | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`MINIMAX_WEB_SEARCH_TOOL` |
| `brave` | `BRAVE_SEARCH_API_KEY` | - |
| `serper` | `SERPER_API_KEY` 或 `GOOGLE_SERPER_API_KEY` | - |
| `tavily` | `TAVILY_API_KEY` | - |

只配置 key 不等于一定会调用付费 API。默认搜索仍优先免费 provider；低成本配置建议用 `CLAUDE_NET_SEARCH_PROVIDERS=bing_rss,duckduckgo,bing_html`。只有明确想用 API 搜索时，再把 Kimi/MiniMax/其他 API provider 加进去。

## Provider 策略

网页搜索和学术搜索是两套顺序：

- `CLAUDE_NET_SEARCH_PROVIDERS` 控制 `web_search` 和旧版 `search_web`/`search_web_focused`。
- `CLAUDE_NET_SCHOLAR_PROVIDERS` 控制 `scholar_search`。
- `CLAUDE_NET_DISABLED_PROVIDERS` 对两类 provider 都生效。

`scholar_search` 默认 `crossref,semantic_scholar,arxiv`。arXiv 对同一出口 IP 有频率限制；遇到 429 后工具会短暂冷却，不会继续连发多种 arXiv 请求。
