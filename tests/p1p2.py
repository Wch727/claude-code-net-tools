import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from document_evidence import evidence
from provider_health import claim, complete, ready
import claude_net_mcp as server

assert server._intent_provider_order("code", "fixture", ["npm"], []) == ["npm"]
original_request = server._request_url
server._request_url = lambda *args, **kwargs: ("https://example.org", "application/json", b'{}', "fixture", 429)
for search in [server._search_semantic_scholar, server._search_crossref, server._search_github_repos, server._search_npm_packages]:
    try:
        search("fixture", 1)
    except RuntimeError as error:
        assert "429" in str(error)
    else:
        raise AssertionError("HTTP 429 must not be treated as empty success")
server._request_url = original_request

stats = {"consecutiveFailures": 3}
claim(stats, 1000)
complete(stats, False, "HTTP 429", 1000)
assert not ready(stats, 1001)
assert ready(stats, stats["retryAt"])
claim(stats, stats["retryAt"])
assert not ready(stats, stats["retryAt"])
complete(stats, True, "", stats["retryAt"])
assert ready(stats, 9999999)
cases = json.loads((Path(__file__).resolve().parents[1] / "contracts/quality.json").read_text(encoding="utf-8"))["document_cases"]
print(json.dumps([evidence(item["document"], item["arguments"]) for item in cases], ensure_ascii=True))
