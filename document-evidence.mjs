import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const contract = JSON.parse(readFileSync(new URL('./contracts/quality.json', import.meta.url)));
export const EVIDENCE_GUIDANCE = 'Use read_url query to find literal text in a long snapshot and quote to verify exact extracted text. Reuse document_id and next_match_offset. These are text-presence checks, not factual truth or publisher authentication. PDF page numbers are physical extraction pages, not printed page labels; section_hint is a heuristic unless section_source=html_heading. Evidence offsets use Unicode code points.';
const fold = value => value.replace(/[A-Z]/g, char => char.toLowerCase());
const heading = /^(?:\d+(?:\.\d+)*[.)]?\s+\S.{0,100}|abstract|introduction|conclusions?|references|\u6458\u8981|\u7ed3\u8bba)$/i;
function pointLength(value) {
  const pairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  let length = value.length;
  while (pairs.exec(value)) length--;
  return length;
}
function move(text, index, amount) {
  let steps = 0;
  while (steps < Math.abs(amount) && (amount < 0 ? index > 0 : index < text.length)) {
    if (amount < 0) {
      index--;
      if (index > 0 && /[\uDC00-\uDFFF]/.test(text[index]) && /[\uD800-\uDBFF]/.test(text[index - 1])) index--;
    } else index += text.codePointAt(index) > 0xffff ? 2 : 1;
    steps++;
  }
  return { index, steps };
}
export function evidence(document, args = {}) {
  if (args.query !== undefined && args.quote !== undefined) throw new Error('Use either query or quote, not both.');
  const mode = args.quote !== undefined ? 'verify_quote' : 'find';
  const needle = args.quote ?? args.query ?? '';
  if (typeof needle !== 'string') throw new Error('Expected non-empty string query or quote.');
  if (!needle.trim() || Array.from(needle).length > (mode === 'find' ? 256 : 2000)) throw new Error('Expected bounded non-empty query or quote.');
  const text = String(document.content || '');
  const haystack = mode === 'find' ? fold(text) : text;
  const target = mode === 'find' ? fold(needle) : needle;
  const context = Math.max(0, Math.min(1000, Math.trunc(Number(args.context_chars ?? 180))));
  const limit = Math.max(1, Math.min(10, Math.trunc(Number(args.max_matches ?? 3))));
  let budget = Math.max(500, Math.min(1000000, Math.trunc(Number(args.max_chars ?? 12000))));
  let cursor = move(text, 0, Math.max(0, Math.trunc(Number(args.match_offset || 0)))).index;
  const matches = [];
  let next = null, budgetExceeded = false;
  while (cursor <= text.length) {
    const index = haystack.indexOf(target, cursor);
    if (index < 0) break;
    const start = pointLength(text.slice(0, index));
    if (matches.length >= limit) { next = start; break; }
    const end = start + pointLength(needle);
    if (end - start > budget) { next = start; budgetExceeded = true; break; }
    const room = Math.floor((budget - (end - start)) / 2);
    const left = move(text, index, -Math.min(context, room)), right = move(text, index + needle.length, Math.min(context, room));
    const excerptStart = start - left.steps, excerptEnd = end + right.steps;
    const lineEnd = text.slice(index).search(/[\r\n\f]/);
    const prior = text.slice(Math.max(0, index - 20000), lineEnd < 0 ? text.length : index + lineEnd).split(/\r?\n|\f/).reverse().map(line => line.trim()).find(line => heading.test(line));
    const section = (document.sections || []).filter(item => item.start <= start).at(-1);
    const finalUrl = document.final_url || document.finalUrl || document.url || '';
    const page = document.kind === 'pdf' && text.includes('\f') ? text.slice(0, index).split('\f').length : null;
    matches.push({ start, end, excerpt_start: excerptStart, excerpt_end: excerptEnd, quote: text.slice(index, index + needle.length), excerpt: text.slice(left.index, right.index),
      section_hint: section?.title || prior || null, section_source: section ? 'html_heading' : prior ? 'text_heuristic' : null, page,
      citation_url: section?.anchor ? finalUrl.split('#')[0] + '#' + encodeURIComponent(section.anchor) : page ? finalUrl.split('#')[0] + '#page=' + page : finalUrl });
    budget -= excerptEnd - excerptStart;
    cursor = index + target.length;
  }
  return { document_id: document.id, final_url: document.final_url || document.finalUrl || document.url || '', mode,
    offset_unit: 'unicode_code_point', total_chars: pointLength(text), searched_from: Math.max(0, Math.trunc(Number(args.match_offset || 0))), content_sha256: createHash('sha256').update(text).digest('hex'),
    matched: matches.length > 0 ? true : budgetExceeded ? null : false, matches, next_match_offset: next, budget_exceeded: budgetExceeded,
    verification_scope: 'Presence in this extracted snapshot only; not factual truth, publisher authentication or independent corroboration.' };
}
