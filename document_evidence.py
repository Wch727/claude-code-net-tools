import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

CONTRACT = json.loads((Path(__file__).parent / "contracts/quality.json").read_text(encoding="utf-8"))
EVIDENCE_GUIDANCE = 'Use read_url query to find literal text in a long snapshot and quote to verify exact extracted text. Reuse document_id and next_match_offset. These are text-presence checks, not factual truth or publisher authentication. PDF page numbers are physical extraction pages, not printed page labels; section_hint is a heuristic unless section_source=html_heading. Evidence offsets use Unicode code points.'
_heading = re.compile(r"^(?:\d+(?:\.\d+)*[.)]?\s+\S.{0,100}|abstract|introduction|conclusions?|references|\u6458\u8981|\u7ed3\u8bba)$", re.I)

def _fold(value):
    return re.sub(r"[A-Z]", lambda match: match[0].lower(), value)

def evidence(document, args=None):
    args = args or {}
    if "query" in args and "quote" in args:
        raise ValueError("Use either query or quote, not both.")
    mode = "verify_quote" if "quote" in args else "find"
    needle = args.get("quote", args.get("query", ""))
    if not isinstance(needle, str):
        raise ValueError("Expected non-empty string query or quote.")
    if not needle.strip() or len(needle) > (256 if mode == "find" else 2000):
        raise ValueError("Expected bounded non-empty query or quote.")
    text = str(document.get("content", ""))
    haystack = _fold(text) if mode == "find" else text
    target = _fold(needle) if mode == "find" else needle
    context = max(0, min(1000, int(args.get("context_chars", 180))))
    limit = max(1, min(10, int(args.get("max_matches", 3))))
    budget = max(500, min(1000000, int(args.get("max_chars", 12000))))
    cursor = max(0, int(args.get("match_offset", 0)))
    matches, next_offset, budget_exceeded = [], None, False
    final_url = document.get("final_url", document.get("finalUrl", document.get("url", "")))
    while cursor <= len(text):
        start = haystack.find(target, cursor)
        if start < 0:
            break
        if len(matches) >= limit:
            next_offset = start
            break
        end = start + len(needle)
        if end - start > budget:
            next_offset, budget_exceeded = start, True
            break
        room = (budget - (end - start)) // 2
        excerpt_start, excerpt_end = max(0, start - min(context, room)), min(len(text), end + min(context, room))
        line_end = re.search(r"[\r\n\f]", text[start:])
        prefix = text[max(0, start - 20000):start + line_end.start() if line_end else len(text)]
        lines = re.split(r"\r?\n|\f", prefix)
        prior = next((line.strip() for line in reversed(lines) if _heading.fullmatch(line.strip())), None)
        sections = [item for item in document.get("sections", []) if item["start"] <= start]
        section = sections[-1] if sections else None
        page = text[:start].count("\f") + 1 if document.get("kind") == "pdf" and "\f" in text else None
        citation_url = final_url.split("#")[0] + "#" + quote(section["anchor"], safe="~()*!.'-") if section and section.get("anchor") else final_url.split("#")[0] + f"#page={page}" if page else final_url
        matches.append({"start": start, "end": end, "excerpt_start": excerpt_start, "excerpt_end": excerpt_end, "quote": text[start:end], "excerpt": text[excerpt_start:excerpt_end], "section_hint": section["title"] if section else prior, "section_source": "html_heading" if section else "text_heuristic" if prior else None, "page": page, "citation_url": citation_url})
        budget -= excerpt_end - excerpt_start
        cursor = end
    return {"document_id": document["id"], "final_url": final_url, "mode": mode, "offset_unit": "unicode_code_point", "total_chars": len(text), "searched_from": max(0, int(args.get("match_offset", 0))), "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "matched": True if matches else None if budget_exceeded else False, "matches": matches, "next_match_offset": next_offset, "budget_exceeded": budget_exceeded, "verification_scope": "Presence in this extracted snapshot only; not factual truth, publisher authentication or independent corroboration."}
