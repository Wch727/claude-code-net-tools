"""A timed-out provider must leave a live budget for the next provider."""
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import claude_net_mcp as server
server.os.environ['CLAUDE_NET_ALLOW_PRIVATE_NETWORK'] = 'true'
from runtime import Operation, operation, run_process

context = Operation()
context.deadline = time.monotonic() + 5
token = operation.set(context)
calls = []
try:
    original_deadline = context.deadline
    server._intent_provider_order = lambda *args: ["slow", "healthy"]
    server._cjk_entity_query = lambda query: True

    def provider(intent, name, query, count):
        calls.append(name)
        if name == "slow":
            run_process([sys.executable, "-c", "import time; time.sleep(20)"], timeout=20)
        return [{"title": "Healthy source", "url": "https://example.com/source", "snippet": "valid", "provider": name}]

    server._run_intent_provider = provider
    result = server._search_query_candidates("fixture", {}, "general", 1, time.time() + 4)
    assert calls == ["slow", "healthy"], calls
    assert result["rows"][0]["url"] == "https://example.com/source", result
    assert context.deadline == original_deadline, "child deadline leaked into parent"
    assert any("time budget exhausted" in note for note in result["notes"]), result
    context.deadline = time.monotonic() + 5
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(429 if self.path == "/limited" else 200)
            self.end_headers()
            self.wfile.write(b"search fixture body")

        def log_message(self, *args):
            pass

    server.os.environ["CLAUDE_NET_PROXY"] = "direct"
    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as fixture:
        thread = threading.Thread(target=fixture.serve_forever, daemon=True)
        thread.start()
        try:
            url = "http://127.0.0.1:" + str(fixture.server_port)
            assert server._search_http_text(url) == "search fixture body"
            try:
                server._search_http_text(url + "/limited")
                raise AssertionError("429 must not be parsed as successful search content")
            except RuntimeError as error:
                assert "HTTP 429" in str(error), error
            # Python-only installs retain urllib when curl is unavailable.
            previous = server.shutil.which
            server.shutil.which = lambda command: None
            try:
                assert server._search_http_text(url) == "search fixture body"
            finally:
                server.shutil.which = previous
        finally:
            fixture.shutdown()
            thread.join()
    context.cancelled.set()
    try:
        server._run_with_deadline(lambda: run_process([sys.executable, "--version"]), time.time() + 2, "cancel")
        raise AssertionError("shared cancellation was lost")
    except RuntimeError as error:
        assert "cancelled" in str(error), error
    print("Python: slow provider reaped, healthy fallback ran, parent deadline and cancellation preserved")
finally:
    operation.reset(token)
