# Claude Code Net Tools

[English](README.en.md)

Claude Code Net Tools 是一个本地 MCP server，为 Claude Code 提供可配置网络出口的搜索、URL 抓取和内容提取工具。

## 解决的问题

当 Claude Code 接外部模型/API、本地代理/VPN、公司代理或免费搜索页面时，模型自带的联网搜索能力可能不可用、不稳定，或者只在 Claude 官方账号/特定模型组合里可用。这个项目把“联网搜索/抓取”拆成一个本地 MCP 工具层：让 Claude Code 负责理解问题和改写 query，让本地工具负责稳定执行搜索、抓取网页、读取 JSON/RSS/PDF，并通过环境变量控制网络出口和 provider。

本工具只提供技术访问能力。请遵守所在地区法律法规、目标网站规则和组织安全要求；它不绕过登录、验证码或权限控制。

## 快速开始

推荐用安装脚本把 MCP 加到 Claude Code：

```powershell
.\scripts\install-claude-code.ps1
```

在 Windows 上，如果系统能找到 `pythonw.exe`，安装脚本会自动使用无窗口启动桥，避免 VS Code/Claude Code 调用 MCP 时闪出命令行窗口。它仍然运行完整的 Node 版；若需调试启动输出，可加 `-ShowConsole`。

macOS/Linux：

```bash
./scripts/install-claude-code.sh
```

需要代理/VPN 时：

```powershell
.\scripts\install-claude-code.ps1 -Proxy http://127.0.0.1:7890
```

安装后在 Claude Code 里先跑总诊断：

```text
Use net-tools net_doctor live=true query="Claude Code MCP"
```

Node/curl 版推荐使用 Node.js 20+ 和系统 `curl`/`curl.exe`，默认不需要 `npm install`。Python 备用版也可手动添加：

```powershell
claude mcp add net-tools-py python C:\path\to\claude-code-net-tools\claude_net_mcp.py
```

不需要代理时，可以不设 `CLAUDE_NET_PROXY`，或设置为 `direct`。

## 常用工具
- `net_doctor`：Claude Code 联网总诊断，默认只检查配置，`live=true` 才实际搜索。
- `search_web`：Claude Code 主搜索入口；支持最多 3 条由 LLM 准备的 query、`general|academic|code|news|official` 意图、总时间预算和可选来源验证，默认不打分重排。
- `search_web_focused`：显式增强搜索，仅在基础搜索太吵时使用。
- `scholar_search`：论文搜索，支持 Crossref、Semantic Scholar、arXiv。
- `package_search`：npm、PyPI、GitHub repository 搜索。
- `fetch_url` / `extract_links` / `fetch_json` / `fetch_rss` / `fetch_pdf`：抓取网页、链接、JSON、RSS/Atom、PDF。
- `browser_screenshot`：用真实浏览器搜索或打开 URL，同时把页面文字和截图交给 Claude Code 观察。
- `browser_action`：在命名 Playwright 会话中打开、点击、填写、等待、滚动、提取、下载并捕获 XHR/JSON。
- `session_create` / `session_status` / `session_clear`：命名 HTTP session，保存默认 headers/cookies/referer，并复用独立 cookie jar。
- `proxy_status` / `search_status` / `pdf_status`：分项诊断网络出口、provider 状态和 PDF 提取工具。

## 浏览器搜索（可选）

`browser_search` 和 `browser_fetch` 通过本机 Playwright 打开真实搜索页并读取 JavaScript 渲染后的内容；`browser_screenshot` 额外返回 MCP 图片，让 Claude Code 直接观察搜索布局、知识面板、图表和复杂组件；`browser_action` 进一步处理表单、按钮、懒加载、下载和页面发出的 JSON 请求。`search_web`、`search_web_focused` 和 `fetch_url` 支持 `browser=never|auto|always`；默认 `auto` 在普通 HTTP 搜索结果不足、独立来源不足，或网页被拦截/只有 JS 空壳时回退。

一次完成“搜索并看图”：

```text
Use net-tools browser_screenshot with query "BERT" engine auto.
```

复杂交互可先用 `browser_action` 打开和点击，再用相同 `session` 调用 `browser_screenshot`。截图默认只取当前视口并使用 JPEG；只有确实需要整页版式时才传 `full_page=true`。

公共搜索引擎可能拦截全新无头浏览器。需要更接近日常浏览器时，用隔离的持久化 Chrome profile 重新注册 MCP：

```powershell
.\scripts\install-claude-code.ps1 -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

验证码只能在可见窗口中由用户手动完成，工具不会绕过；不要把 profile 指向正在运行的日常 Chrome。

首次使用浏览器功能前检查并安装：

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

浏览器功能是可选的；不安装时原有 HTTP 搜索、抓取、API 和 PDF 工具仍可使用。用 `browser_status live=true` 做真实浏览器诊断。

## 文档

- [配置和 API key](docs/config.zh.md)
- [工具说明和限制](docs/tools.zh.md)
- [测试、烟测题和开发检查](docs/testing.zh.md)
- [Claude Code 搜索提示词说明](prompts/README.zh.md)

## 最小验证

```powershell
npm test
```

`npm test` 会离线启动 fixture，并通过 MCP JSON-RPC 同时测试 Node/curl 版和 Python 版，不下载依赖。

已安装 Playwright 浏览器时，可再运行真实渲染烟测：

```powershell
npm run test:browser-live
```
