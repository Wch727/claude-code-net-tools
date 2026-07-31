# Claude Code Net Tools

[English](README.en.md)

Claude Code Net Tools 是一个运行在本机的 MCP server。它给 Claude Code 增加网页搜索、URL 抓取、动态网页读取、截图、JSON/RSS/PDF 提取等工具。

它不包含模型，也不会替 Claude Code 回答问题。实际流程是：

1. Claude Code 理解你的问题，并决定调用哪个 `net-tools` 工具。
2. 本工具通过本机网络、代理或搜索 API 执行请求。
3. 工具把搜索结果或网页内容返回给 Claude Code。
4. Claude Code 阅读来源后组织答案。

这解决的是“Claude Code 已经能对话，但当前账号、模型或网络环境无法稳定使用内置联网功能”的问题。它不会修改或接管 Claude Code 内置的 `WebSearch`/`Fetch`；需要时可在提示词中明确要求使用 `net-tools`。

## 能做和不能做

可以：

- 使用免费搜索页面或你自行配置的搜索 API。
- 使用本机代理/VPN；未指定时自动探测常见本地代理端口，然后尝试直连。
- 抓取普通网页、JSON、RSS/Atom 和 PDF。
- 使用 Playwright 读取 JavaScript 渲染页面、点击按钮、填写表单、截取页面和捕获 XHR/fetch。
- 使用命名 HTTP session 保存 headers、cookies、referer 和独立 cookie jar。

不可以：

- 自动绕过登录、验证码、付费墙或网站权限。
- 保证每个公共搜索引擎都不触发限速或机器人验证。
- 像 PDF 阅读器一样还原公式、表格和复杂排版。
- 替 Claude Code 判断来源是否可靠；事实答案仍应打开来源正文核实。

请遵守所在地区法律法规、目标网站规则和组织安全要求。

## 安装

### 1. 前置条件

推荐的 Node 版需要：

- 已安装 Claude Code，终端里能运行 `claude --version`。
- Node.js 20 或更新版本，能运行 `node -v`。
- 系统 `curl`，能运行 `curl --version`。Windows 10/11 通常自带 `curl.exe`。

默认不需要 `npm install`。PDF 文本提取和浏览器功能有单独的可选依赖，见后文。

### 2. 下载并进入仓库

```powershell
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
```

### 3. 注册到 Claude Code

Windows，推荐注册到用户级，这样所有项目都能使用：

```powershell
.\scripts\install-claude-code.ps1 -Scope user
```

macOS/Linux：

```bash
./scripts/install-claude-code.sh --scope user
```

只想在当前项目使用时，把 `user` 改成 `local`。修改安装选项或移动仓库后，添加 `-Force`（macOS/Linux 为 `--force`）重新注册。

使用固定代理：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy http://127.0.0.1:7890
```

强制直连，不扫描本地代理：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy direct
```

Windows 上若能找到 `pythonw.exe`，安装脚本会用它作为无窗口启动桥，但内部仍运行完整 Node 版。它只用于避免 VS Code/Claude Code 启动 MCP 时闪出控制台，不会把工具切换成 Python 版。需要查看启动窗口调试时可加 `-ShowConsole`。

### 4. 确认安装结果

在终端运行：

```powershell
claude mcp get net-tools
```

应看到：

- `Status` 行包含 `Connected`
- `Type: stdio`
- 入口文件指向本仓库的 `claude_net_mcp.mjs`

然后重新打开 Claude Code 会话，在对话中输入：

```text
请只使用 net-tools，调用 net_doctor，设置 live=true，搜索“Claude Code MCP”，并说明每个检查项是否成功。
```

`net_doctor` 默认只检查配置；只有 `live=true` 才会真正联网。诊断成功后，普通问题不需要手写工具参数。

## 日常怎么用

直接告诉 Claude Code 使用 `net-tools` 并说明任务即可：

```text
请用 net-tools 搜索“叶兰峰是谁”，打开至少两个独立来源后再回答，并附来源链接。
```

```text
请用 net-tools 查 BERT 原始论文。先搜索，再打开论文摘要页，告诉我标题、作者、年份和主要贡献。
```

```text
请用 net-tools 打开这个 URL。普通抓取没有正文时，改用 browser_fetch 读取 JavaScript 渲染后的页面。
```

```text
请用 net-tools 在浏览器中搜索 BERT，并用 browser_screenshot 截图，让你同时观察搜索结果和知识面板。
```

Claude Code 会自己准备查询词和工具参数。只有调试特定 provider、超时或浏览器行为时，才需要显式指定参数。

## 该选哪个工具

| 需求 | 工具 | 具体行为 |
| --- | --- | --- |
| 普通网页搜索 | `search_web` | 主搜索入口；合并多条 query 和多个 provider 的结果。 |
| 搜索结果太杂 | `search_web_focused` | 可额外清理 query、过滤低相关结果；不建议默认使用。 |
| 论文 | `scholar_search` | 查询 Crossref、Semantic Scholar、arXiv。 |
| npm/PyPI/GitHub 项目 | `package_search` | 查询包注册表或 GitHub repositories。 |
| 已知网页 URL | `fetch_url` | 下载页面并提取可读正文；支持分段读取和链接提取。 |
| JSON 或 RSS | `fetch_json` / `fetch_rss` | 保留结构并格式化输出。 |
| PDF | `fetch_pdf` | 下载 PDF；安装 `pdftotext` 后可提取纯文本。 |
| 浏览器搜索页 | `browser_search` | 打开 Google/Bing/DuckDuckGo 并按页面原顺序提取结果。 |
| JavaScript 动态页面 | `browser_fetch` | 用 Playwright 执行页面 JavaScript 后读取正文。 |
| 需要看布局、图表或图片 | `browser_screenshot` | 返回页面文字和截图。 |
| 点击、填写、加载更多、抓接口 | `browser_action` | 在同一个命名浏览器 session 中连续操作。 |
| 检查故障 | `net_doctor` / `proxy_status` / `search_status` / `browser_status` / `pdf_status` | 分别检查整体、网络出口、搜索源、浏览器和 PDF 工具。 |

如果同时需要正文和链接，使用 `fetch_url include_links=true`，不必再单独调用 `extract_links`。

## 搜索结果按什么顺序返回

`search_web` 不使用另一个模型给结果打分，也默认不做启发式相关性重排。顺序大致是：

1. Claude Code 提供主 query 和最多两条备选 query。
2. 工具按配置的 provider 顺序执行搜索。
3. 工具去除重复 URL。
4. 结果按 query/provider 轮询合并，避免一个来源占满全部位置。

因此第 1 条不一定是“最权威”或“最正确”。需要可靠答案时，让 Claude Code 打开前几个独立来源再总结。`verify_top` 只检查页面能否访问、最终 URL、标题和正文长度，不改变顺序。

未设置 `CLAUDE_NET_SEARCH_PROVIDERS` 时，非中文查询默认顺序是 `bing_rss,duckduckgo,bing_html`；中文查询默认是 `bing_rss,bing_html,sogou,so360,duckduckgo`。不可用或连续失败的 provider 会被跳过。

`intent=academic` 会改走论文 provider，`intent=code` 会改走 GitHub/npm/PyPI；普通人物、事件和概念使用 `general`。

## 浏览器功能

浏览器功能是可选的。首次使用前运行：

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

安装后可在 Claude Code 中检查：

```text
请使用 net-tools 调用 browser_status，设置 live=true。
```

默认是后台浏览器，不显示窗口，但 `browser_screenshot` 仍能返回截图。只有安装时使用 `-BrowserHeaded` 才会显示真实浏览器窗口，例如需要手动完成验证码并复用专用 profile：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

不要把 profile 指向正在运行的日常 Chrome。公共搜索引擎仍可能限制无头浏览器；浏览器模式是 HTTP 搜索/抓取失败后的补充，不是保证更高质量的搜索 API。

`search_web`、`search_web_focused` 和 `fetch_url` 支持 `browser=never|auto|always`。默认 `auto` 只在普通搜索结果不足、独立来源不足、HTTP 抓取失败、命中反爬页或只得到 JavaScript 空壳时启动浏览器；`never` 禁止回退，`always` 强制使用浏览器。

## 搜索 API（可选）

不配置 API key 也能使用免费 provider。支持 Kimi/Moonshot、MiniMax、Brave、Serper 和 Tavily；key 只从环境变量读取，仓库和安装脚本不会包含、上传或保存你的 key。

例如在 Windows 用户环境中配置 Tavily：

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "your-key", "User")
.\scripts\install-claude-code.ps1 -Scope user -Force -Providers tavily,bing_rss,duckduckgo
```

配置后需完全重启 VS Code/Claude Code，让新进程读取环境变量。删除 key：

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", $null, "User")
```

对本工具而言，只配置 key 不会自动调用 API；只有把对应 provider 加入搜索顺序或在工具调用中明确指定它，才可能产生调用和费用。其他 provider 的变量名和 base URL 配置见[配置和 API key](docs/config.zh.md)。

## PDF

`fetch_pdf` 下载 PDF 不需要额外依赖。要提取文本，需安装 Poppler `pdftotext` 并放入 PATH，或设置 `CLAUDE_NET_PDFTOTEXT`。

纯文本适合摘要、引言、结论和参考文献；公式、表格、多栏排版和图片可能乱序。涉及推导或版式时，应下载后用 PDF 阅读器查看，而不是只依赖提取文本。

## 常见问题

### `Status` 不是 `Connected`

```powershell
claude mcp get net-tools
.\scripts\install-claude-code.ps1 -Scope user -Force
```

重新打开 Claude Code。如果提示 `Conflicting scopes`，用 `claude mcp list` 找到重复项，只保留一个 scope。

### 每次调用闪出黑色控制台

在 Windows 运行 `claude mcp get net-tools`。若 `Command` 是 `pythonw.exe`，已启用无窗口桥；旧会话仍可能保留旧进程，需完全重启 VS Code。没有 `pythonw.exe` 时工具仍能运行，但某些图形宿主可能显示 Node 控制台。

### 出现白色浏览器窗口

这通常表示安装时启用了 `-BrowserHeaded`。不需要可见浏览器时，重新执行：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force
```

### 搜索没有结果或很慢

先让 Claude Code 调用 `proxy_status`，再调用 `search_status live=true`。若某个免费 provider 被限速，可暂时换 provider 顺序，或配置搜索 API。学术搜索遇到 arXiv 429 时，工具会冷却并继续尝试 Crossref/Semantic Scholar。

### Claude Code 内置 `Fetch` 报域名不安全

这是 Claude Code 内置抓取工具的校验，不是本项目返回的错误。提示 Claude Code“不要使用内置 Fetch，改用 `net-tools fetch_url`”；动态页面改用 `net-tools browser_fetch`。

### 长网页被截断

`fetch_url` 返回 `next_offset` 时，继续请求同一个 URL，并把 `offset` 设置为该值。`max_chars` 控制单次返回长度，不是下载上限。

## Python 备用版

Python 3.10+ 备用版只使用标准库，不需要 `pip install`：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Runtime python -Force
```

Python 版只支持 HTTP(S) 代理；SOCKS 代理和主要 Windows 安装场景推荐 Node/curl 版。Python 版启用 Playwright 时仍需要 Node.js/npm。

## 文档

- [配置、环境变量和 API key](docs/config.zh.md)
- [所有工具参数和限制](docs/tools.zh.md)
- [测试、烟测题和开发检查](docs/testing.zh.md)
- [Claude Code 搜索提示词](prompts/README.zh.md)

## 开发验证

```powershell
npm test
```

该命令使用本地 fixture 测试 Node 和 Python 两个 MCP 实现，不访问真实搜索引擎。已安装 Playwright 浏览器时可运行 `npm run test:browser-live`；它会实际启动浏览器进程，仅用于开发验证。
