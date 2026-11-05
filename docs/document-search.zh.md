# 文档内检索与引用定位

[English](document-search.en.md)

不增加新工具，也不另接模型 API。Claude Code 理解问题、选择关键词；`read_url` 在完整提取快照中找原文，返回小段证据。默认仍优先使用原生联网工具。

## 检索长网页

下面是传给 MCP `read_url` 的 JSON 参数，不是终端命令：

```json
{"url":"https://docs.python.org/3/library/asyncio-task.html","query":"TaskGroup","max_matches":3,"context_chars":180,"max_chars":2000,"browser":"never"}
```

首次下载、提取完整快照后检索，命中不限于前 2000 字。检索模式中 `max_chars` 限制所有摘录的总字符数，不包含 JSON 字段和重复的 `quote`。这是字面查找，ASCII 英文字母不区分大小写，中文保留原字；不是向量语义搜索。模型可根据问题改用原文的专业术语。

复用返回的快照，不重新下载：

```json
{"document_id":"上次返回的ID","query":"cancellation","max_chars":1500}
```

命中过多时，把 `next_match_offset` 作为 `match_offset` 继续。它是 Unicode 码点位置，不是结果序号，也不是普通阅读的 `offset`；没有下一批时为 `null`。

## 核对引文

```json
{"document_id":"上次返回的ID","quote":"精确复制的一段原文","context_chars":100}
```

`query`、`quote` 二选一。引文匹配区分大小写和空白，核对提取后文本，不是 HTML 字节。PDF 换行、连字符、公式提取可能改变文字，因此未匹配不代表原 PDF 中一定不存在。

| 字段 | 含义 |
| --- | --- |
| `matched` | 当前范围内是否命中；预算不足且尚未返回命中时为 `null`，不是“没有这段话” |
| `matches[].quote` / `excerpt` | 实际命中文字及上下文，未经模型改写 |
| `start` / `end` | 原快照中文字的 Unicode 码点位置，左闭右开 |
| `excerpt_start` / `excerpt_end` | 上下文在原快照的位置 |
| `section_hint` / `section_source` | `html_heading` 来自 HTML 标题；`text_heuristic` 只是文本标题猜测 |
| `page` | PDF 提取物理页，从 1 开始；无分页标记时为 `null`，不猜页码 |
| `citation_url` / `final_url` | 网页章节锚点或 PDF `#page=N`，以及重定向后的最终地址 |
| `content_sha256` | 完整提取文本哈希，用于识别快照，不是网站真实性证明 |
| `searched_from` / `next_match_offset` | 本次与下一批查找起点 |
| `budget_exceeded` | 引文比剩余摘录预算长，需要增加 `max_chars` |

检索模式下 `content` 为空，普通阅读的 `offset/end` 为 0，`next_offset` 为 `null`。证据和位置在 `matches`；顺序阅读仍使用原来的 `content` 和 `next_offset`。

**边界：** 成功只证明快照中有这段文字。HTTP 200、URL、引文和哈希不能单独证明事实正确、发布者身份真实或来源相互独立；仍需模型检查原始来源是否支持结论。不绕过验证码或登录权限，不改变安全默认值；未增加 OCR、公式重建、重启后持久缓存。

## 搜索源恢复

连续失败默认 3 次后冷却 60 秒，HTTP 429 立即冷却。恢复失败会延长等待，最长 5 分钟。到期后由下一次真实搜索尝试恢复，同一来源只允许一个同时进行的恢复试探；无后台探测、无额外收费 API 调用。成功清除冷却。手动指定 `providers` 也不绕过冷却；arXiv 原有专用限流保护仍生效。

在 MCP 进程环境中配置 `CLAUDE_NET_PROVIDER_FAIL_LIMIT`（1–10）、`CLAUDE_NET_PROVIDER_COOLDOWN_MS`（1000–300000 毫秒），修改后重启 MCP。完整工具集的 `search_status` 显示 `recovery`、`retryAt`（Unix 毫秒）、`failureKind`、最近耗时和失败原因；默认三工具会在搜索 notes 中说明冷却。

恢复模块：`provider-health.mjs` / `provider_health.py`。证据模块：`document-evidence.mjs` / `document_evidence.py`。两版共享 `contracts/quality.json` 中的新增参数和测试样例。旧服务器主体尚未全部拆分；修改后运行 `npm test` 验证两版契约。
