const fold = value => String(value).replace(/[A-Z]/g, char => char.toLowerCase());
export const paperItems = items => items.filter(item => item.type !== 'component');
export const REQUIRED_TERMS_SCHEMA = { type: 'array', maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 128 }, default: [], description: 'Optional literal terms that must all appear in each result title, URL or snippet (ASCII case-insensitive). Use for distinctive identifiers such as TaskGroup when results are generic. Empty leaves results unchanged; never reranks.' };
export const SEARCH_GUIDANCE = 'If results ignore a distinctive identifier, reformulate once and set required_terms to that identifier. This is optional literal filtering, not scoring or reranking. AI summaries and model-proposed URLs are unverified; read original URLs before citing them. No original-source URL means no citable result, never an API endpoint substitute.';

export function requiredTerms(rows, terms = []) {
  terms = terms ?? [];
  if (!Array.isArray(terms) || terms.length > 6 || terms.some(term => typeof term !== 'string' || !term.trim() || [...term].length > 128)) throw new Error('required_terms must contain at most 6 bounded non-empty strings');
  if (!terms.length) return rows;
  return rows.filter(row => {
    const text = fold([row.title || '', row.url || '', row.source_type ? '' : row.snippet || ''].join('\n'));
    return terms.every(term => text.includes(fold(term.trim())));
  });
}

export function chatSources(data, provider, base, count) {
  const message = data.choices?.[0]?.message || {};
  const summary = typeof message.content === 'string' ? message.content : '';
  const candidates = [];
  for (const list of [data.search_results, data.citations, message.citations, message.annotations]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const source = typeof item === 'string' ? { url: item } : item?.url_citation || item;
      if (source && typeof source === 'object') candidates.push({ url: source.url || source.link, title: source.title, source_type: 'provider_citation' });
    }
  }
  for (const match of summary.matchAll(/https?:\/\/[^\s<>"'\[\]]+/gi)) {
    let url = match[0].replace(/[.,;!?:]+$/, '');
    while (url.endsWith(')') && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) url = url.slice(0, -1);
    candidates.push({ url, source_type: 'model_link' });
  }
  const apiHost = new URL(base).hostname.toLowerCase(), seen = new Set(), rows = [];
  for (const item of candidates) {
    if (typeof item.url !== 'string') continue;
    let url;
    try { url = new URL(item.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname.toLowerCase() === apiHost || seen.has(url.href)) continue;
    seen.add(url.href);
    rows.push({ title: String(item.title || url.hostname).replace(/\s+/g, ' ').trim(), url: url.href,
      snippet: 'AI-generated summary (not original page text): ' + Array.from(summary.replace(/\s+/g, ' ').trim()).slice(0, 2000).join(''), provider,
      source_type: item.source_type, verification: 'unverified source URL; not fetched or fact-checked' });
    if (rows.length >= count) break;
  }
  if (!rows.length) throw new Error(provider + ': AI response has no original-source URLs; summary is not citable search evidence');
  return rows;
}
