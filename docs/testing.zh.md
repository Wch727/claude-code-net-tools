# 测试和烟测

[English](testing.en.md) | [返回 README](../README.md)

## 安装检查

```powershell
claude mcp get net-tools
```

应看到 `Status: Connected`。升级后必须完全重启 VS Code/Claude Code并新建会话。

在新会话中先问：

```text
请列出 net-tools 当前提供的工具名，不要调用工具。
```

精简模式应只有：`web_search`、`read_url`、`browser_interact`。

## 推荐烟测题

每题单独开新会话更容易观察模型是否正确选工具。

### 1. 人物搜索和多来源核实

```text
只用 net-tools 联网。叶兰峰是谁？请改写搜索词，打开至少两个独立来源后回答，并附链接。
```

预期：先调用 `web_search`，再调用至少一次 `read_url`；不应调用内置 Fetch/WebFetch。

### 2. 学术搜索

```text
只用 net-tools 联网。BERT 原始论文是哪一篇？请读取论文摘要页，给出标题、作者、年份、arXiv ID 和三点主要贡献。
```

预期：`web_search intent=academic`，随后 `read_url`；搜索失败时模型应改写查询，而不是直接说没有结果。

### 3. 长论文快照续读

```text
只用 net-tools 找到并读取 Attention Is All You Need。先读取摘要，再继续读取结论；如果返回 next_offset，必须使用 document_id 续读，不要重新下载 URL。说明每次读取的 offset。
```

预期：首次 `read_url` 返回 `document_id`；后续调用只传 `document_id + offset`，结果显示 `Snapshot: cache`。

### 4. 普通 URL 和链接

```text
只用 net-tools 读取 https://example.com，并同时返回页面正文和链接。
```

预期：`read_url include_links=true`，返回状态、正文、链接和结构化字段。

### 5. JavaScript 页面

```text
只用 net-tools 的浏览器打开一个 JavaScript 页面，读取渲染后的标题和正文；普通 HTTP 为空时不要改用内置 Fetch。
```

预期：`browser_interact action=read`。

### 6. 搜索页截图

```text
只用 net-tools 在真实浏览器里搜索 BERT，截图搜索结果页，然后根据截图和提取结果告诉我前三条来源；重要结论仍需打开原始来源核实。
```

预期：`browser_interact action=screenshot` 返回文字和 image，之后用 `read_url` 核实来源。

## 开发回归

```powershell
npm test
```

本地 fixture 会同时测试 Node 和 Python：

- 默认三个工具和 `full` 完整工具模式。
- Node/Python schema 一致。
- `web_search`、`read_url`、`browser_interact` 的 `structuredContent`。
- 超过旧 1.2 MB 上限的长 HTML 快照。
- 网页和 PDF 第二段读取不增加服务器请求计数。
- PDF 提取、arXiv 429 冷却、浏览器模拟、HTTP session、链接和反爬诊断。

安装了真实 Playwright 浏览器时还可运行：

```powershell
npm run test:browser-live
```

该命令会启动真实浏览器，仅用于本机开发验证。