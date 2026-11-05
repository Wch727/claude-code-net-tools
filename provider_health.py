import json
import math
import os
import re
import threading
import time
from pathlib import Path

_defaults = json.loads((Path(__file__).parent / "contracts/quality.json").read_text(encoding="utf-8"))["provider_recovery"]
FAILURE_LIMIT = max(1, min(int(os.environ.get("CLAUDE_NET_PROVIDER_FAIL_LIMIT", _defaults["failure_limit"])), 10))
_cooldown = max(1000, min(int(os.environ.get("CLAUDE_NET_PROVIDER_COOLDOWN_MS", _defaults["cooldown_ms"])), _defaults["maximum_cooldown_ms"]))
lock = threading.RLock()

def ready(stats, now=None):
    with lock:
        return not stats.get("probing") and (time.time() * 1000 if now is None else now) >= stats.get("retryAt", 0)

def reason(stats, now=None):
    now = time.time() * 1000 if now is None else now
    wait = max(0, math.ceil((stats.get("retryAt", now) - now) / 1000))
    return f"provider cooldown or recovery probe in progress; retry in about {wait}s; last failure: {stats.get('lastError') or stats.get('failureKind') or 'unknown'}"

def claim(stats, now=None):
    with lock:
        if not ready(stats, now):
            raise ValueError(reason(stats, now))
        if stats.get("retryAt"):
            stats["probing"] = True

def complete(stats, ok, error="", now=None):
    with lock:
        stats["probing"] = False
        kind = "" if ok else "rate_limit" if re.search(r"\b429\b|rate.?limit", error, re.I) else "authorization" if re.search(r"\b40[13]\b", error) else "timeout" if re.search(r"timeout|timed out|deadline|budget", error, re.I) else "network"
        stats["failureKind"] = kind
        if ok:
            stats["retryAt"] = 0
        elif kind == "rate_limit" or stats["consecutiveFailures"] >= FAILURE_LIMIT:
            stats["retryAt"] = (time.time() * 1000 if now is None else now) + min(_defaults["maximum_cooldown_ms"], _cooldown * 2 ** min(8, max(0, stats["consecutiveFailures"] - FAILURE_LIMIT)))
