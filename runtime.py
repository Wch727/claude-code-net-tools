"""Request-scoped deadlines, cancellation and safe subprocess diagnostics."""
import contextvars
import os
import re
import subprocess
import threading
import time
import urllib.parse

operation = contextvars.ContextVar("operation", default=None)
_secrets = set()
_lock = threading.RLock()
_sensitive = re.compile(r"authorization|cookie|password|passwd|secret|token|api[_-]?key", re.I)


def remember(value, key=""):
    if isinstance(value, dict):
        for name, item in value.items():
            remember(item, key if _sensitive.search(key) else name)
    elif isinstance(value, list):
        for item in value:
            remember(item, key)
    elif isinstance(value, str):
        with _lock:
            if value and _sensitive.search(key):
                _secrets.add(value)
                _secrets.update(part for part in re.split(r"[;=\s]+", value) if len(part) > 3)
            try:
                url = urllib.parse.urlsplit(value)
                for part in (url.username, url.password):
                    if part:
                        _secrets.add(urllib.parse.unquote(part))
                for name, item in urllib.parse.parse_qsl(url.query):
                    if item and _sensitive.search(name):
                        _secrets.add(item)
            except ValueError:
                pass


remember(dict(os.environ))


def redact(value):
    text = str(value)
    with _lock:
        for secret in sorted(_secrets, key=len, reverse=True):
            text = text.replace(secret, "[REDACTED]").replace(urllib.parse.quote(secret, safe=""), "[REDACTED]")
    text = re.sub(r"(https?://)[^\s/@]+@", r"\1[REDACTED]@", text, flags=re.I)
    text = re.sub(r"((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+", r"\1[REDACTED]", text, flags=re.I)
    return re.sub(r"([?&](?:[^&=]*(?:token|secret|password|api[_-]?key)[^&=]*)=)[^&#\s]+", r"\1[REDACTED]", text, flags=re.I)


def sanitize(value):
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {key: sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    return value


class Operation:
    def __init__(self):
        self.cancelled = threading.Event()
        self.deadline = float("inf")


def check_operation():
    context = operation.get()
    if context and context.cancelled.is_set():
        raise RuntimeError("Request cancelled")
    if context and time.monotonic() >= context.deadline:
        raise TimeoutError("time budget exhausted")


def submit(executor, function, *args):
    context = contextvars.copy_context()
    return executor.submit(context.run, function, *args)


def run_process(command, *, timeout=120, input=None, check=False, capture_output=False, **options):
    check_operation()
    context = operation.get()
    deadline = min(time.monotonic() + timeout, context.deadline if context else float("inf"))
    if capture_output:
        options.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if input is not None:
        options["stdin"] = subprocess.PIPE
    try:
        with subprocess.Popen(command, **options) as child:
            try:
                first = True
                while True:
                    check_operation()
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("time budget exhausted")
                    try:
                        stdout, stderr = child.communicate(input=input if first else None, timeout=min(0.05, remaining))
                        break
                    except subprocess.TimeoutExpired:
                        first = False
                if check and child.returncode:
                    raise RuntimeError(f"Subprocess failed (exit {child.returncode})")
                return subprocess.CompletedProcess(command, child.returncode, stdout, stderr)
            finally:
                if child.poll() is None:
                    child.kill()
                    child.communicate()
    except OSError as exc:
        raise RuntimeError(f"Subprocess unavailable (errno {exc.errno})") from None
