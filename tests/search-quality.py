import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from search_quality import chat_sources, required_terms, paper_items
import claude_net_mcp as server

data = {"choices": [{"message": {"content": "An AI summary, not an original page.", "annotations": [{"type": "url_citation", "url_citation": {"title": "Original page", "url": "https://example.org/paper"}}]}}]}
rows = chat_sources(data, "kimi", "https://api.moonshot.cn/v1", 3)
assert required_terms(rows, ["missing"]) == []
original_request = server._request_url
paper_data = {'message': {'items': [{'type': 'component', 'title': ['supplement.docx'], 'URL': 'https://example.org/supplement'}, {'type': 'proceedings-article', 'title': ['Original paper'], 'URL': 'https://example.org/paper'}]}}
assert len(paper_items(paper_data['message']['items'])) == 1
server._request_url = lambda *args, **kwargs: ('https://example.org', 'application/json', json.dumps(paper_data).encode(), 'fixture', 200)
assert [row['title'] for row in server._search_crossref('fixture', 3)] == ['Original paper']
server._request_url = original_request
original_fallback = server._fetch_arxiv_html_fallback
calls = []
server._request_url = lambda *args, **kwargs: (_ for _ in ()).throw(TimeoutError("fixture download timeout"))
server._fetch_arxiv_html_fallback = lambda url, args, reason: calls.append(reason) or "HTML fallback fixture"
try:
    output = server.fetch_pdf({"url": "https://arxiv.org/pdf/1706.03762", "timeout": 3})
    assert "HTML fallback fixture" in output
    assert "download" in calls[0].lower()
    calls.clear()
    try:
        server.fetch_pdf({"url": "https://arxiv.org/pdf/1706.03762", "html_fallback": False})
    except RuntimeError as error:
        assert "download stage" in str(error)
    else:
        raise AssertionError("disabled fallback must not turn an error into success")
    assert not calls
    server._request_url = lambda *args, **kwargs: ("https://arxiv.org/pdf/1706.03762", "application/pdf", b"Rate limited", "fixture", 429)
    assert "HTTP 429" in server.fetch_pdf({"url": "https://arxiv.org/pdf/1706.03762"})
    assert not calls, "HTTP 429 must not trigger more requests"
    cancelled = server.Operation()
    cancelled.cancelled.set()
    token = server.operation.set(cancelled)
    try:
        try:
            server.fetch_pdf({"url": "https://arxiv.org/pdf/1706.03762"})
        except RuntimeError as error:
            assert "cancelled" in str(error).lower()
        else:
            raise AssertionError("cancelled PDF must not proceed")
        assert not calls, "cancellation must not trigger fallback"
    finally:
        server.operation.reset(token)
finally:
    server._request_url = original_request
    server._fetch_arxiv_html_fallback = original_fallback
print(json.dumps(rows))
