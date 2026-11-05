# 0.14.3 安装可靠性与搜索失败基线

[English](reliability-0.14.3.en.md)

这一版不添加检索算法、不默认重排，也不接入新模型。先确认工具可以全新安装，再记录现有搜索为什么失败。是否优先优化召回或长文档检索，等人工核查评测数据后决定。

## 安装

在已克隆的仓库目录执行：

```powershell
# Windows，显式允许下载锁定的 npm 依赖
.\scripts\install-claude-code.ps1 -Scope user -Runtime node -InstallDependencies
# 已运行 npm ci 则不加 -InstallDependencies
# Python 普通 HTTP 版无需 npm/pip
.\scripts\install-claude-code.ps1 -Scope user -Runtime python
```

```bash
# macOS / Linux
bash scripts/install-claude-code.sh --scope user --runtime node --install-dependencies
# Python 普通 HTTP 版
bash scripts/install-claude-code.sh --scope user --runtime python
```

Node 需要 Node.js 20+、curl 和仓库 npm 依赖；Python 普通 HTTP 需要 Python 3.10+ 和本仓库的标准库实现，不需要 pip。Python 的浏览器功能仍另需 Node/Playwright，PDF 提取仍需可用的 pdftotext。安装脚本不会自动安装浏览器或 PDF 工具。

默认只检查，不下载包。显式安装选项执行 `npm ci`，按 package-lock.json 安装，可能需要访问 npm。预检查验证版本、核心依赖、curl（Node）及实际 MCP `initialize` / `tools/list`；不调用搜索、不打开浏览器、不消耗模型额度。失败时不执行注册，包括 `-Force` / `--force` 的移除步骤。预检查通过后注册仍可能失败，失败会返回非零退出码，不再打印 Done。强制替换不是事务：通过检查后，若旧注册已移除而新注册失败，需要重新注册。

脚本不再回显可能包含代理认证信息的完整命令。完成注册后重启 Claude Code 并新建会话。注册与离线启动通过不等于网络畅通、免费搜索质量可靠或浏览器可用。

隔离安装烟测：

```powershell
npm run test:install
# 在全新临时目录中真实下载依赖；显式联网
npm run test:install:fresh
```

烟测使用带空格的全新目录及假 Claude CLI，只检查注册参数，不接触真实 Claude 配置。覆盖缺依赖时不删除旧注册、无 node_modules 的 Python、Node 启动、实际 npm ci（fresh 模式）、注册失败传播。跨平台 CI 在主工作区 `npm ci` 之前执行 fresh 模式，不能再靠已有依赖掩盖全新安装问题。

## 固定搜索题库

[30 道题](../tests/quality/search-cases.json)包括中文姓名、技术术语、官方文档、论文、标准与概念。6 道 dev 题用于已知回归，24 道 test 题作为冻结对照；修改题库会改变报告中的 SHA-256。公开题目不是保密评测集，也未经过独立审查者验证。原有 8 个质量验收场景继续保留，不混作搜索准确率题库。

默认命令只显示用法，不联网：

```powershell
npm run quality:search
# 3 道题、两版 MCP，仅免费搜索，不读取网页
npm run quality:search -- --run
# 30 道题，Node 基线；每题最多读首条 URL，可能耗时十余分钟
npm run quality:search -- --run --limit 30 --runtime node --reads 1
# 相同题目的可选字面约束对照；不是新排序算法
npm run quality:search -- --run --limit 3 --mode terms
```

`--case taskgroup,person-mayb` 可指定题目，`--limit` 默认 3，最大 30。通用题固定使用 bing_rss、duckduckgo、bing_html，学术题固定 crossref、arxiv；不选择已配置的收费 API，不调用 Claude、不使用浏览器、不修改全局注册。每次搜索总预算 20 秒，读取预算 10 秒；arXiv 等原有冷却仍生效。长批次可能发生搜索源冷却，报告会保留其影响，不能看作每题独立同分布的实验。

报告为 `.quality/search-eval-<mode>-<runtime>.json` 和 `.md`，包含版本、提交、工作区状态、题库哈希、查询、公开结果摘要、来源诊断、可选读取与证据位置。相同模式/运行时会覆盖上次结果，比较前请保留前次报告；完整运行前先用少量题检查网络。目录被 Git 忽略，不上传个人环境和原始日志。不要把报告当成来自真实 Claude Code 的工具选择测试。

运行期间逐题写入同名前缀的 `.partial.jsonl`，中断时仍保留已完成测量。诊断规则修正后可离线重建完整报告，不重复请求搜索源：

```powershell
node tests/quality/search-report.mjs .quality/search-eval-baseline-node.json
```

重建保留查询、候选、耗时、读取摘录和人工 review，只更新诊断及汇总，并写入 `diagnostics_rebuilt_at`。本轮修复了旧报告把 `time budget: 20s` 普通配置行、查询中的错误关键词误报成失败的问题；真实预算耗尽仍会标记，冷却行不当作一次新的限流请求。

## 失败如何归因

- `required_terms_excluded` / `domain_excluded`：MCP 明确记录解析后候选被约束排除的数量；不是判断过滤规则错误，更不是语义不相关的证据。
- `rate_limited` / `challenge` / `timeout` / `deadline` / `address_policy` / `http_error` / `dns_error` / `cooldown`：诊断文本中观察到的现象。多个原因可以并存，不强行只选一个根因。
- `upstream_or_parser_empty`：MCP 记录解析为 0 条；仅凭这个数无法区分源真的为空和页面结构未识别。需要原始响应检查，不自动归咎于搜索引擎。
- `unknown`：没有足够证据；不猜原因。
- `entity_literal_missing`：现有中文实体检查未找到完整姓名/实体字面匹配，但仍保留结果；这是需审查的信号，不自动替代身份判断。
- `read_failed` / `read_unverified` / `read_literal_missing`：分别表示原文读取报错、状态/正文不足以确认读取、或快照中未找到指定字面文本。都不等同于页面一定不支持答案。

自动统计每个运行时的非空结果比例和观察样本的 P50/P95，搜索失败和空结果不从延迟分母删除。小样本分位数不能外推生产表现。读取耗时单列，不混进搜索延迟。`mcp_tool_calls` 是已发出的工具调用数，不是底层 HTTP 请求数。未获得的 HTTP 请求数、模型 Token 和实际费用为 null。

P@3、任务成功率、来源独立性和答案支持程度都保留未审查状态。人工逐条打开原文，记录支持哪些问题、是否为原始来源，再填写 `review`。HTTP 200、字面命中或有 3 个 URL 都不自动判合格。检索到的 DOI 和 arXiv 副本也不算两个独立来源。

## 仍需追踪

0.14.2 曾出现一次 Python 安全测试关停超时，随后重跑及三平台 CI 通过；根因未确认。保留原有 15 秒预算、取消/清理断言和诊断，不以安装烟测代替生命周期验证。当前未增加 BM25F、Embedding、BGE 或额外模型调用。

## 本机首轮基线

使用上面的 30 题 Node 命令，随后用 Python 跑前 3 题；报告标明测量时工作区有未提交改动。两轮都没有调用模型、收费源或浏览器。以下只是单机单次基线，不是总体准确率或两版公平性能对比。

| Node 30 题观察 | 数量 |
| --- | ---: |
| 搜索返回非空候选 | 30/30 |
| 首条 URL 读取取得 HTTP 成功状态与文本 | 16/30 |
| 首条 URL 读取报错 | 14/30 |
| 取得文本且指定字面词存在 | 4/30 |
| 取得文本但指定字面词不存在 | 12/30 |
| 搜索中遇到来源冷却跳过 | 18/30 |

搜索耗时样本 P50 为 924ms、P95 为 9945ms，不含原文读取。较快不代表结果有用，冷却跳过也会缩短耗时。14 次读取错误中，观察到 HTTP 403 六次、404 一次、HTTP 200 但未取得可用快照三次、地址策略拒绝两次，其余两次保留原始错误供检查；这些现象不一定有共同根因。Python 前 3 题均有候选，TaskGroup 读取未命中字面词，姓名题出现完整实体未匹配和读取错误，BERT 首条读取命中字面词。不能把 Python 三题和 Node 三十题直接比较平均性能。

人工抽查的明确问题：TaskGroup 的前三条候选不回答 asyncio 问题；ExceptionGroup 返回 Python 首页/下载页而非异常文档；Adam 论文题返回其他优化方法；Attention 题的同名候选不保证是 Vaswani 原论文，首条读取为 404。姓名题找到包含完整姓名的候选但读取被地址策略拒绝；BERT 原论文 DOI 转到 ACL Anthology，读取成功。尚未逐条核验全部 90 个候选，P@3 与任务成功率保持未审查，不把 4 次字面命中当作 4 次任务成功。

**下一步优先诊断召回链路和读取错误，而不是先加 BM25F 或重排。** 从 `searchQueryCandidates` / `_search_query_candidates` 的查询、来源与预算记录以及学术来源返回的候选身份入手。MCP 记录不能单独区分上游返回和解析损失，需要少量针对性的原始响应对照；不为诊断关闭内网地址保护，也不反复重试已限流来源。
