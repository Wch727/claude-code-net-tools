# 0.14.1 来源标注与读取修复

[English](search-fixes.en.md)

## 来源和 AI 摘要分开

Kimi/MiniMax 不再将 API 服务地址作为搜索结果 URL。优先读取响应中的 `search_results`、`citations`、消息引用和 URL annotations；模型文本里的链接单独标记。无法获得原始网页 URL 时，返回明确诊断，不生成可引用的假结果。

| `source_type` | 含义 |
| --- | --- |
| `provider_citation` | API 响应的引用字段提供的 URL，仍未经本机读取核实 |
| `model_link` | 从模型文本中提取的 URL，可能错误或虚构，仍需读取 |

摘要带有 `AI-generated summary (not original page text)` 标记，不冒充原始网页摘录。API 主机地址、带用户名密码的地址和非 HTTP(S) 链接不会成为来源。`verify_top` 仅核对 HTTP 可达性，不证明摘要、事实或发布者身份真实。

## 可选关键词约束

传给 `web_search` 的 JSON 参数：

```json
{"query":"Python asyncio TaskGroup documentation","required_terms":["TaskGroup"],"count":3,"browser":"never"}
```

`required_terms` 默认空，不改变原有结果。设置后，所有指定词必须在标题、URL 或搜索摘要中出现；ASCII 英文不区分大小写。AI 生成摘要不参与来源相关性匹配，避免模型只是在摘要里复述问题就算命中。最多 6 个词，每个最长 128 个 Unicode 字符。

过滤在每个来源返回后执行，让后续来源有机会补充，而不是先被泛化结果填满。最终浏览器结果也遵守过滤。保留结果原顺序，不打分重排；可能返回不足或零结果，不能凭空提高召回率。这条策略已进入 MCP 工具描述，不需要手动粘贴提示词。

## PDF 超时和备用路径

`timeout` 现在约束下载、提取及备用读取的总预算，而不是每阶段各用一遍。可使用 arXiv HTML 备用路径时，下载阶段最多使用预算的 70%；其他 PDF 最多 85%，余量供提取使用。预算太短仍可能失败，请按文件大小选择。

arXiv PDF 在下载发生超时或临时连接错误时，也能进入既有 HTML 备用路径；此前这类异常会直接退出。认证拒绝和 HTTP 429 不继续请求备用路径。取消任务不触发新请求，`html_fallback=false` 仍禁用备用路径。HTML 备用读取不再强制打开浏览器，遵守传入的 `browser`，未指定则使用 HTTP。

PDF 成功快照含 `timings.download_ms` 和 `timings.extraction_ms`，缓存读取保留原抓取计时，不代表本次缓存读取延迟。失败信息区分下载阶段与文本提取阶段。尚未进一步细分 DNS/TLS/首字节耗时，也不保证所有长论文或站点都能读取。

## 验证边界

新增两版本地模拟 API 测试、无来源响应测试、可选过滤测试、慢速 PDF 总预算测试和下载错误转 HTML 的测试。测试不调用真实 Kimi/MiniMax 或其他收费 API。模拟来源通过不代表真实账户兼容所有响应格式；免费搜索的长期相关性仍需真实题库衡量。

搜索来源归一化和可选过滤已独立到 `search-quality.mjs` / `search_quality.py`，旧服务器主体未做大规模重写。许可证经仓库所有者确认采用 [MIT](../LICENSE)，第三方依赖保持各自许可。

一次免费联网烟测中，两版都成功下载同一篇真实 arXiv PDF 并定位结论：Node 约 2.3 秒、Python 约 6.5 秒。此结果不是长期成功率，也不能证明先前超时只由本项目引起。同时，带 `TaskGroup` 约束的查询没有取得合格结果：DuckDuckGo 被地址安全策略拒绝，Bing 返回泛化内容或空结果。过滤改善了错误结果冒充相关结果的问题，**尚未证明免费搜索的召回率提高**。本轮没有追加收费模型实测。
