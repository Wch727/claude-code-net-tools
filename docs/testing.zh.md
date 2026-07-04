# 测试、烟测题和开发检查

[English](testing.en.md) · [返回首页](../README.md)

## Claude Code 烟测题

安装或改配置后，建议在 Claude Code 里按顺序问这些题。它们能覆盖网络出口、搜索、抓取、分页、学术搜索和 PDF。

```text
Use net-tools net_doctor live=true query="Claude Code MCP".
Use net-tools proxy_status.
Use net-tools search_status.
Use net-tools search_web to search "叶兰峰是谁" count 5.
Use net-tools search_web to search "BERT Bidirectional Encoder Representations from Transformers Google arXiv 1810.04805" count 5, then summarize the key sources.
Use net-tools fetch_url to read https://example.com with extract readable include_links true link_limit 10.
Use net-tools scholar_search to search "Attention Is All You Need Vaswani 2017 transformer" count 5.
Use net-tools search_web to search "Attention Is All You Need arXiv PDF" count 5, choose the official arXiv PDF, then use net-tools fetch_pdf to read it.
```

好的结果不要求所有 provider 都成功，但应满足：能显示当前 route；至少一个搜索 provider 可用；`fetch_url` 能返回正文、状态码和必要时的 `next_offset`；`scholar_search` 不应因 arXiv 429 一直连发请求；PDF 如果本机 `pdftotext` 不可用，应给出明确诊断。

## Session 烟测题

```text
Use net-tools session_create to create a session named demo with headers {"X-Test":"ok"}, cookies {"token":"example"}, and referer "https://example.com/".
Use net-tools session_status for session demo.
Use net-tools fetch_url to read https://example.com with session demo and extract readable.
Use net-tools session_clear for session demo.
```

## 开发检查

```powershell
npm run check
npm test
```

`npm run check` 会检查 Node 版语法，并编译检查 Python 版。`npm test` 会在本地启动离线 fixture，分别通过 MCP JSON-RPC 烟测 Node/curl 版和 Python 版，覆盖：

- 工具列表和 schema parity。
- `net_doctor` 配置诊断，默认不调用付费 API。
- `fetch_url` 分页和链接提取。
- `session_create/session_status/session_clear` 以及 session headers/cookies/referer。
- `search_status` provider 诊断。
- arXiv 429 冷却，不继续连发请求。

默认不下载依赖。