import re
import urllib.parse

def paper_items(items):
    return [item for item in items if item.get('type') != 'component']

REQUIRED_TERMS_SCHEMA = {"type": "array", "maxItems": 6, "items": {"type": "string", "minLength": 1, "maxLength": 128}, "default": [], "description": "Optional literal terms that must all appear in each result title, URL or snippet (ASCII case-insensitive). Use for distinctive identifiers such as TaskGroup when results are generic. Empty leaves results unchanged; never reranks."}
SEARCH_GUIDANCE = 'If results ignore a distinctive identifier, reformulate once and set required_terms to that identifier. This is optional literal filtering, not scoring or reranking. AI summaries and model-proposed URLs are unverified; read original URLs before citing them. No original-source URL means no citable result, never an API endpoint substitute.'

def _fold(value):
    return re.sub(r"[A-Z]", lambda match: match[0].lower(), str(value))

def required_terms(rows, terms=None):
    terms = [] if terms is None else terms
    if not isinstance(terms, list) or len(terms) > 6 or any(not isinstance(term, str) or not term.strip() or len(term) > 128 for term in terms):
        raise ValueError("required_terms must contain at most 6 bounded non-empty strings")
    if not terms:
        return rows
    out = []
    for row in rows:
        keys = ("title", "url") if row.get("source_type") else ("title", "url", "snippet")
        text = _fold("\n".join(str(row.get(key) or "") for key in keys))
        if all(_fold(term.strip()) in text for term in terms):
            out.append(row)
    return out

def chat_sources(data, provider, base, count):
    message = ((data.get("choices") or [{}])[0].get("message") or {})
    summary = message.get("content") if isinstance(message.get("content"), str) else ""
    candidates = []
    for items in (data.get("search_results"), data.get("citations"), message.get("citations"), message.get("annotations")):
        if not isinstance(items, list):
            continue
        for item in items:
            source = {"url": item} if isinstance(item, str) else (item.get("url_citation") or item) if isinstance(item, dict) else None
            if isinstance(source, dict):
                candidates.append({"url": source.get("url") or source.get("link"), "title": source.get("title"), "source_type": "provider_citation"})
    for match in re.finditer(r"https?://[^\s<>\"'\[\]]+", summary, re.I):
        url = match[0].rstrip(".,;!?:")
        while url.endswith(")") and url.count(")") > url.count("("):
            url = url[:-1]
        candidates.append({"url": url, "source_type": "model_link"})
    api_host = (urllib.parse.urlsplit(base).hostname or "").lower()
    rows, seen = [], set()
    for item in candidates:
        if not isinstance(item.get("url"), str):
            continue
        try:
            url = urllib.parse.urlsplit(item["url"])
            url.port  # Validate malformed ports before presenting a source URL.
            host = (url.hostname or "").lower()
            if url.scheme not in ("http", "https") or not host or url.username or url.password or host == api_host:
                continue
            normalized = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path or "/", url.query, url.fragment))
        except ValueError:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        rows.append({"title": re.sub(r"\s+", " ", str(item.get("title") or host)).strip(), "url": normalized,
                     "snippet": "AI-generated summary (not original page text): " + re.sub(r"\s+", " ", summary).strip()[:2000],
                     "provider": provider, "source_type": item["source_type"], "verification": "unverified source URL; not fetched or fact-checked"})
        if len(rows) >= count:
            break
    if not rows:
        raise ValueError(provider + ": AI response has no original-source URLs; summary is not citable search evidence")
    return rows
