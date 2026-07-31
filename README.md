# Claude Code Net Tools

[English](README.en.md)

给 Claude Code 使用的本地联网 MCP。它解决的问题很具体：当 Claude Code 内置搜索不可用、内置 `Fetch/WebFetch` 报域名安全校验、免费搜索源不稳定，或者需要读取长网页、PDF、JavaScript 页面时，让 Claude Code 改用本机工具完成搜索和读取。

本项目不包含模型，也不替 Claude Code 思考。Claude Code 负责理解问题、生成查询和综合答案；本项目负责联网、返回来源和正文。

## 默认只需要三个工具

| 工具 | 用途 |
| --- | --- |
| `web_search` | 搜索网页、论文、代码、新闻或官方来源。支持一条主查询和最多两条备选查询。 |
| `read_url` | 读取 HTML、纯文本、JSON、RSS/Atom 和 PDF。长文档首次读取后生成快照，后续用 `document_id + offset` 继续，不再重新下载。 |
| `browser_interact` | 用 Playwright 处理真实搜索页、JavaScript 页面、截图、点击、输入、滚动、下载和网络响应。 |

默认工具列表故意只显示这三个，减少 Claude Code 选错工具。旧版的 `search_web`、`fetch_url`、`fetch_pdf`、`browser_fetch` 等接口仍然保留；需要调试或兼容旧提示词时，设置 `CLAUDE_NET_TOOL_PROFILE=full` 后重启 Claude Code 即可显示全部工具。

## 工作原理

1. Claude Code 把用户问题改写成适合搜索的查询。
2. `web_search` 从免费搜索源、可选搜索 API 或浏览器搜索中获取候选来源。
3. Claude Code 选择来源并调用 `read_url`。
4. `read_url` 一次下载并提取完整文档快照，单次只返回 `max_chars` 指定的片段。
5. 如果结果有 `next_offset`，Claude Code 用同一个 `document_id` 继续读取；续读只访问内存快照，不重复联网或重复运行 `pdftotext`。
6. 普通 HTTP 读取失败、页面依赖 JavaScript 或需要观察布局时，再调用 `browser_interact`。

文档快照默认最多保存 12 份、合计 8000 万字符、有效 1 小时。它只存在于 MCP 进程内存中；Claude Code 或 MCP 重启后，需要重新读取 URL。

## 安装

### 1. 必需环境

推荐 Node 版本：

- Claude Code：`claude --version`
- Node.js 20 或更高：`node -v`
- curl：`curl --version`，Windows 10/11 通常自带 `curl.exe`

基础搜索和网页读取不需要运行 `npm install`。

Python 备用版本需要 Python 3.10 或更高：`python --version`。它只使用标准库，也不需要 `pip install`。Python 标准库只支持 HTTP(S) 代理；SOCKS 代理请用 Node/curl 版本。

可选依赖：

- PDF 文本提取：安装 Poppler `pdftotext`，确保 `pdftotext -v` 能运行；也可设置 `CLAUDE_NET_PDFTOTEXT` 为可执行文件路径。
- 浏览器功能：需要 Node.js/npm 和 Playwright CLI，安装方法见后文。

### 2. 下载和注册

```powershell
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
.\scripts\install-claude-code.ps1 -Scope user
```

macOS/Linux：

```bash
git clone https://github.com/Wch727/claude-code-net-tools.git
cd claude-code-net-tools
./scripts/install-claude-code.sh --scope user
```

`user` 表示所有项目可用；只给当前项目使用时改成 `local`。仓库移动、配置变化或升级后，加 `-Force`（macOS/Linux 为 `--force`）重新注册。

Windows 安装脚本会尽量使用无窗口启动器，避免每次 MCP 调用闪出命令行窗口；需要看启动错误时加 `-ShowConsole`。

### 3. 检查并重启

```powershell
claude mcp get net-tools
```

应看到 `Status: Connected`、`Type: stdio`，入口指向本仓库。然后完全重启 VS Code/Claude Code，并新建会话；旧会话不会重新读取 MCP 工具清单和指令。

## 直接这样用

```text
请只使用 net-tools 联网。搜索“叶兰峰是谁”，打开至少两个独立来源后再回答，并附来源链接。
```

```text
请用 net-tools 查找 BERT 原始论文，读取摘要和结论，告诉我标题、作者、年份和主要贡献。
```

```text
请用 net-tools 读取这个长文档。如果返回 next_offset，就使用 document_id 继续，直到覆盖与问题有关的部分。
```

```text
请用 net-tools 在真实浏览器中搜索 BERT，截图搜索结果页，并打开结果中的原始论文核实。
```

完整搜索策略已内置在 MCP 的自动说明和三个主工具的 `description` 中；安装后新开 Claude Code 会话即可生效，不需要复制提示词或修改 `CLAUDE.md`。[prompts](prompts/README.zh.md) 仅保留中英文策略说明，方便查看。

## 长网页和 PDF

`read_url` 默认允许下载最多 20 MB 的文档快照，单次默认返回 12000 个字符。两者不是同一个限制：

- `max_bytes` 控制第一次最多下载多少内容，默认 20 MB，最高 50 MB。
- `max_chars` 控制本次给 Claude Code 返回多少文字，默认 12000，避免一次塞满上下文。
- `next_offset` 表示还有内容。
- `document_id` 指向已经下载和提取好的快照；续读不会再次请求网站。

PDF 文本由 `pdftotext` 提取。它适合摘要、正文和参考文献，但公式、表格、多栏布局和图片仍可能乱序。需要精确检查推导或版式时，应配合 PDF 阅读器或 `browser_interact action=screenshot` 查看原页面。

arXiv PDF 下载失败、返回非 PDF 或自动提取失败时，可回退到 ar5iv HTML；传 `html_fallback=false` 可关闭。

## Playwright 浏览器

首次使用前运行：

```powershell
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli install-browser
```

之后 Claude Code 可以通过一个入口执行：

- `browser_interact action=search`：打开 Google/Bing/DuckDuckGo 搜索页并提取结果。
- `action=read`：读取 JavaScript 渲染后的正文。
- `action=screenshot`：返回页面截图和可提取文字。
- `action=open|snapshot|click|type|wait|scroll|extract|download|network|close`：在命名 session 中连续操作复杂网页。

浏览器功能不会自动绕过登录、验证码、付费墙或网站权限。需要手动登录或处理验证码时，可安装为可见浏览器并使用专用 profile：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Browser chrome -BrowserProfile "$HOME\.claude-net-tools\chrome-profile" -BrowserHeaded
```

不要把 profile 指向正在运行的日常 Chrome 目录。

## 网络和代理

默认会扫描常见本地代理端口，再尝试直连。固定代理：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy http://127.0.0.1:7890
```

强制直连并关闭端口扫描：

```powershell
.\scripts\install-claude-code.ps1 -Scope user -Force -Proxy direct
```

Node/curl 版本支持 HTTP、HTTPS 和 `socks5h://`；Python 版本支持 HTTP(S)。

## 搜索源和 API key

不配置 key 也能使用免费 provider。支持 Kimi/Moonshot、MiniMax、Brave、Serper 和 Tavily；key 只从环境变量读取，不应写进仓库、README、MCP 参数或提交历史。

Windows 配置 Tavily 示例：

```powershell
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "your-key", "User")
.\scripts\install-claude-code.ps1 -Scope user -Force -Providers tavily,bing_rss,duckduckgo
```

然后完全重启 VS Code/Claude Code。只设置 key 不会自动产生 API 调用；只有 provider 顺序中包含对应服务，或 Claude Code 显式指定它时才会调用。其他变量名见 [配置和 API key](docs/config.zh.md)。

## 常见问题

### Claude Code 仍调用内置 Fetch，并提示域名不安全

这是 Claude Code 内置工具的校验，不是 net-tools 返回的错误。升级后新建会话，并明确说：

```text
外部搜索和 URL 读取只使用 net-tools；不要使用内置 Fetch、WebFetch 或 WebSearch。
```

### 读取第二段时又联网

请确认调用的是 `read_url`，并把上一条返回的 `document_id` 和 `next_offset` 原样传回。不要只传 URL。快照在 MCP 重启或超过有效期后会失效，这是预期行为。

### 需要旧工具名

Windows 用户环境中设置：

```powershell
[Environment]::SetEnvironmentVariable("CLAUDE_NET_TOOL_PROFILE", "full", "User")
```

重启后会显示全部兼容工具。恢复精简模式时把值改为 `compact` 或删除该变量。

### 搜索无结果或很慢

先让 Claude Code 改写查询，补充英文名、机构、年份、论文题名或官网限定。免费搜索引擎可能限速或要求验证码；这时可改用 `browser_interact action=search`、调整 provider，或配置搜索 API。

## 文档

- [配置、环境变量和 API key](docs/config.zh.md)
- [三个主工具、完整兼容工具和限制](docs/tools.zh.md)
- [测试和烟测题](docs/testing.zh.md)
- [Claude Code 内置搜索策略](prompts/README.zh.md)

开发验证：

```powershell
npm test
```

测试会同时启动 Node 和 Python MCP，验证工具清单、结构化返回、长网页快照、PDF 续读、浏览器模拟、会话和搜索 provider，不访问真实搜索引擎。