import { parseDocument } from 'htmlparser2';
import { decodeHTML } from 'entities';

const cards = new Set(['b_algo', 'result', 'vrwrap', 'rb', 'res-list']);
const snippets = new Set(['b_caption', 'result__snippet', 'str_info', 'str_content', 'res-desc', 'res-description']);
const excluded = new Set(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form']);
const blocks = new Set(['p', 'div', 'li', 'br']);
const tag = node => (node.name || '').toLowerCase().split(':').at(-1);
const hasClass = (node, names) => (node.attribs?.class || '').split(/\s+/).some(name => names.has(name));
function* walk(root) {
  const stack = [[root, 0]];
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (++count > 50000 || depth > 128) throw new Error('Search page exceeds parser node/depth limits');
    yield node;
    if (excluded.has(tag(node))) continue;
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], depth + 1]);
  }
}
function text(node) {
  const out = [];
  for (const child of walk(node)) {
    if (child.type === 'text') out.push(child.data);
    else if (blocks.has(tag(child))) out.push(' ');
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}
function address(raw, base) {
  try {
    let url = new URL(decodeHTML(raw || ''), base);
    if (url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) {
      const target = url.searchParams.get('uddg');
      if (target) url = new URL(target);
    }
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function parseSearchHtml(source, limit, provider, base) {
  if (String(source).length > 2000000) throw new Error('Search page exceeds parser input limit');
  const document = parseDocument(String(source), { decodeEntities: true });
  const rows = [], seen = new Set();
  for (const anchor of walk(document)) {
    if (tag(anchor) !== 'a') continue;
    let parent = anchor.parent, heading = false, card = null, fallback = null, blocked = false;
    while (parent) {
      const name = tag(parent);
      if (excluded.has(name)) { blocked = true; break; }
      if (name === 'h2' || name === 'h3') heading = true;
      if (!card && hasClass(parent, cards)) card = parent;
      if (!fallback && ['div', 'li', 'article'].includes(name)) fallback = parent;
      parent = parent.parent;
    }
    const duckTitle = hasClass(anchor, new Set(['result__a']));
    if (blocked || !(heading || duckTitle) || (provider === 'bing_html' && !card)) continue;
    const url = address(anchor.attribs?.href, base), title = text(anchor);
    if (!url || !title || seen.has(url)) continue;
    const container = card || fallback;
    let snippet = '';
    if (container) {
      const nodes = [...walk(container)];
      const headings = nodes.filter(node => ['h2', 'h3'].includes(tag(node))).length;
      if (card || headings <= 1) {
        const description = nodes.find(node => hasClass(node, snippets)) || nodes.find(node => tag(node) === 'p');
        if (description) snippet = Array.from(text(description)).slice(0, 2000).join('');
      }
    }
    seen.add(url);
    rows.push({ title, url, snippet, provider });
    if (rows.length >= limit) break;
  }
  return rows;
}
export function parseSearchFeed(source, limit, provider = 'bing_rss') {
  const value = String(source);
  if (value.length > 2000000) throw new Error('Search feed exceeds parser input limit');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(value.replace(/\0/g, ''))) throw new Error('Search feed declarations are not allowed');
  const document = parseDocument(value, { xmlMode: true, decodeEntities: true, recognizeCDATA: true });
  const nodes = [...walk(document)];
  if (!nodes.some(node => ['rss', 'feed'].includes(tag(node)))) throw new Error('Expected a search feed, received a non-feed page');
  const rows = [];
  for (const item of nodes.filter(node => tag(node) === 'item')) {
    const child = name => (item.children || []).find(node => tag(node) === name);
    const plain = node => text(parseDocument(decodeHTML(text(node || {})), { decodeEntities: true }));
    const title = decodeHTML(text(child('title') || {})).replace(/\s+/g, ' ').trim();
    const url = address(text(child('link') || {}));
    if (title && url) rows.push({ title, url, snippet: plain(child('description')), provider });
    if (rows.length >= limit) break;
  }
  return rows;
}
export function candidateLimit(count, terms, kind) {
  return terms?.length && kind === 'free' ? Math.max(count, 10) : count;
}
