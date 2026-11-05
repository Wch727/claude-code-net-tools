# 0.14.2 搜索质量改进

[English](search-quality.en.md)

## 实际修复

- HTML 来源按自然搜索结果卡片解析，而不是抓页面上所有链接。Bing 的面包屑、导航和页脚不再冒充结果。
- 保留 Bing、DuckDuckGo、搜狗和 360 卡片中的摘要；兼容链接属性顺序变化和标题内嵌标签。`Task<em>Group</em>` 不会被拆成两个词。
- 搜索 RSS 可处理命名空间、CDATA 和 HTML 实体；意外返回非 feed 页面时不再被 Python 静默算成成功的零结果。解析过程不执行网页脚本，不使用可展开自定义实体的 XML 解析器，拒绝 DTD/ENTITY 声明并限制输入、节点和深度。
- 指定 `required_terms`、`allowed_domains` 或 `blocked_domains` 时，免费来源检查至少 10 个候选，再应用约束并取请求数量。收费 API 的请求数量不增加。没有约束时保留原来的数量。
- 域名约束在各来源结果加入候选池前执行，避免不合格来源占满数量后提前停止，错过后面的合格来源。结果顺序不变，不新增打分重排。
- Crossref 的 `type=component` 不再作为论文结果返回；实测发现它会把补充材料 `.docx` 混入原论文搜索。期刊论文、会议论文、预印本、书籍等不因此被排除。

## 安装和升级

Node 版在仓库执行 `npm ci`，会安装锁定版本的 `htmlparser2` 和 `entities`。Python 的普通 HTTP 搜索仍使用标准库，不新增 pip 依赖。浏览器功能的既有 Node/Playwright 依赖不变。

## 验证

```powershell
npm test
node tests/quality/search-live.mjs --run
python tests/quality/inspect-free-search.py --run
```

`npm test` 只使用本地样例和模拟服务。后两个命令会实际联网，但仅访问免费来源，不调用 Claude 模型、付费 API 或自动打开浏览器，也不修改全局配置。联网报告在忽略目录 `.quality/search-latest.json`，包含版本、提交与工作区是否有未提交改动。

确定性的本地改进：属性顺序变化的 DuckDuckGo 卡片仍能取到结果；仅在摘要中出现的 TaskGroup 不再因摘要丢失被误滤；第 10 条免费候选能在约束过滤后返回；两个不合格域名来源不再挡住第三个合格来源；补充材料不再当作论文。两版对同一 HTML/RSS 样例逐字段比较。

## 实网观察与边界

2026-11-05 的三题烟测中，两版均能返回中文姓名的精确全名来源，以及 BERT 原论文的 DOI 和 arXiv 页面。姓名来源的字面匹配不等于身份消歧；同一论文的两个链接也不等于两个独立来源。

TaskGroup 技术标识符题仍未取得合格结果：Bing 的原始 HTML/RSS 本身返回偏题内容，DuckDuckGo 在本轮网络中超时或被地址策略拒绝。改变短查询、引号或市场参数也没有证实改善，因此没有把这些试验性参数写入默认行为。没有关闭安全检查，也没有为了凑结果返回已知不满足约束的网页。

**结论：这一版修复了解析丢信息、候选过早截断和来源约束应用太晚的问题，但不能宣称免费搜索已达到浏览器质量。** 字面命中数量只是检查指标，不代表事实正确、语义相关性或来源可信度。真实账户的 Kimi/MiniMax 和日常 Claude Code 同题对照未在本轮追加测试。
