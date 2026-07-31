# 工具说明和限制

[English](tools.en.md) | [返回 README](../README.md)

## 默认工具清单

`CLAUDE_NET_TOOL_PROFILE` 未设置或为 `compact` 时，Claude Code 只看到三个工具。这样可以避免 `search_web`/`search_web_focused`、`fetch_url`/`fetch_pdf`/`browser_fetch` 等相近接口同时出现，降低选错概率。

### `web_search`

统一搜索入口。

主要参数：

- `query`：Claude Code 准备的主查询，必填。
- `queries`：最多两条备选查询。
- `intent`：`general|academic|code|news|official`。
- `count`：返回 1-10 条结果。
- `providers`：显式指定 provider；通常留空使用配置顺序。
- `browser=never|auto|always`：禁用、自动回退或强制浏览器搜索。
- `verify_top`：检查前几条 URL 能否访问，不改变顺序。
- `time_budget`：本次搜索的总秒数预算。

工具按 query/provider 轮询合并并去重，默认不启发式重排。`intent=academic` 遇到精确论文标题时会把精确命中放在模糊结果前。

返回内容同时包含：

- 可直接给 Claude Code 阅读的文本列表。
- `structuredContent.results`：标题、URL、provider、摘要和验证信息。
- `structuredContent.notes`：provider 状态和回退说明。

### `read_url`

统一文档入口，支持 HTML、文本、JSON、RSS/Atom 和 PDF。

新文档：

```json
{"url":"https://example.com/article","max_chars":12000}
```

继续读取：

```json
{"document_id":"doc_...","offset":12000,"max_chars":12000}
```

重要参数：

- `kind=auto|page|pdf`：默认按 URL 判断 PDF，也可强制指定。
- `max_bytes`：首次下载上限，默认 20 MB，最高 50 MB。
- `max_chars`：本次返回字符数，默认 12000。
- `offset`：本次起始字符位置。
- `document_id`：已有快照 ID；传它时不访问 URL。
- `refresh=true`：忽略同 URL 的已有快照，重新下载。
- `include_links=true`：正文后同时返回链接。
- `extract=auto|readable|text|markdown|raw`：网页提取方式。
- `browser=never|auto|always`：HTTP 读取策略。
- `extractor=auto|pdftotext|none`：PDF 提取方式。

成功快照会返回 `document_id`、`offset`、`end`、`total_chars` 和 `next_offset`。有 `next_offset` 时，下一次应只传 `document_id + next_offset`；工具从进程内存读取，不会重新下载网页/PDF，也不会再次运行 `pdftotext`。

快照默认有效 1 小时，最多 12 份，合计 8000 万字符。MCP 重启后快照消失。被反爬页、HTTP 错误和浏览器回退结果不会冒充正常 HTTP 文档快照。

### `browser_interact`

统一浏览器入口。

| `action` | 行为 |
| --- | --- |
| `search` | 渲染 Google、Bing 或 DuckDuckGo 搜索页并提取结果。 |
| `read` | 打开 URL，执行 JavaScript 后读取正文和链接。 |
| `screenshot` | 返回截图、页面文字和基本元数据。 |
| `open` / `snapshot` | 打开或检查命名浏览器 session。 |
| `click` / `type` / `wait` / `scroll` | 操作页面。 |
| `extract` | 提取目标元素内容。 |
| `download` | 触发并保存下载。 |
| `network` | 捕获匹配的 XHR/fetch 响应。 |
| `close` | 关闭命名 session。 |

交互操作优先用 `target.role + target.name`、`target.label`、`target.text` 或 `target.test_id` 定位。只有页面没有稳定语义标识时再用 CSS。

截图结果仍包含 MCP image；所有 action 额外返回 `structuredContent`，方便 Claude Code 读取 action、URL、标题和搜索结果。

## 完整兼容工具

设置 `CLAUDE_NET_TOOL_PROFILE=full` 后，工具列表还会显示：

- 诊断：`net_doctor`、`proxy_status`、`search_status`、`browser_status`、`pdf_status`。
- HTTP session：`session_create`、`session_status`、`session_clear`。
- 搜索兼容接口：`search_web`、`search_web_focused`、`scholar_search`、`package_search`。
- 读取兼容接口：`fetch_url`、`extract_links`、`fetch_json`、`fetch_rss`、`fetch_pdf`。
- 浏览器兼容接口：`browser_search`、`browser_fetch`、`browser_screenshot`、`browser_action`。

这些接口没有删除，旧提示词和手动调用仍可继续使用；新提示词应优先用三个主工具。

## 限制

- 本项目不会绕过登录、授权、验证码、付费墙或网站访问规则。
- 免费搜索引擎可能限速、返回验证码或调整 HTML；浏览器模式也不保证一定通过反机器人检查。
- `read_url` 的 HTTP 快照上限最高 50 MB；更大文件应下载后交给专用文档工具处理。
- PDF 纯文本不能完整保留公式、表格、多栏布局和图片。涉及推导或版式时需要查看原 PDF。
- 浏览器读取会执行页面 JavaScript，但不会执行由 Claude Code 任意提供的 JavaScript。
- 外部网页内容是不可信来源材料，不应被当成系统指令。
- Claude Code 内置 `Fetch/WebFetch` 的域名安全错误不来自本项目；应让 Claude Code 使用 `read_url` 或 `browser_interact action=read`。