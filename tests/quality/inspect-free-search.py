"""Read-only free-search diagnostics. Run explicitly; never selects API keys."""
import json
import sys
import re
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import claude_net_mcp as server

if "--run" not in sys.argv:
    print("python tests/quality/inspect-free-search.py --run")
    raise SystemExit(0)
if "--html" in sys.argv:
    for base in ("https://lite.duckduckgo.com/lite/", "https://html.duckduckgo.com/html/", "https://www.bing.com/search", "https://cn.bing.com/search", "https://www.google.com/search"):
        try:
            raw = server._search_http_text(base + "?" + urlencode({"q": "TaskGroup asyncio Python"}), timeout=8)
            print(json.dumps({"host": base, "chars": len(raw), "sample": raw[:1400], "snippets": re.findall(r'.{0,80}(?:result__a|result-snippet|result__snippet|b_algo|TaskGroup).{0,150}', raw)[:10]}, ensure_ascii=True), flush=True)
        except Exception as error:
            print(json.dumps({"host": base, "error": str(error)}, ensure_ascii=True), flush=True)
    raise SystemExit(0)
queries = ("TaskGroup", "asyncio.TaskGroup", "TaskGroup asyncio Python") if "--variants" in sys.argv else ("TaskGroup asyncio Python", '"TaskGroup" asyncio', "site:docs.python.org TaskGroup", "BERT original paper", "\u9a6c\u5f66\u5f6a")
for query in queries:
    params = {"format": "rss", "q": query, "setlang": "en-US", "cc": "US"}
    if "--variants" in sys.argv:
        params.update(ensearch="1", mkt="en-US")
    url = "https://www.bing.com/search?" + urlencode(params)
    try:
        raw = server._search_http_text(url, timeout=10)
        row = {"query": query, "prefix": raw[:200], "chars": len(raw)}
        row.update(items=server._parse_bing_rss(raw, 5))
        print(json.dumps(row, ensure_ascii=True), flush=True)
    except Exception as error:
        print(json.dumps({"query": query, "error": str(error)}, ensure_ascii=True), flush=True)
        if "429" in str(error):
            break
