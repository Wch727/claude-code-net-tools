"""Non-executing search-card/feed parsing; no XML entity expansion or network IO."""
import html
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qs

_cards = {'b_algo', 'result', 'vrwrap', 'rb', 'res-list'}
_snippets = {'b_caption', 'result__snippet', 'str_info', 'str_content', 'res-desc', 'res-description'}
_excluded = {'script', 'style', 'nav', 'footer', 'header', 'aside', 'form'}
_void = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class _Tree(HTMLParser):
    def __init__(self, source, xml=False):
        super().__init__(convert_charrefs=True)
        if len(source) > 2000000:
            raise ValueError('Search page exceeds parser input limit')
        self.root = {'tag': '', 'attrs': {}, 'children': [], 'parent': None}
        self.stack, self.xml, self.count = [self.root], xml, 0
        self.feed(source)
        self.close()

    def handle_starttag(self, name, attrs):
        self.count += 1
        if self.count > 50000 or len(self.stack) > 128:
            raise ValueError('Search page exceeds parser node/depth limits')
        node = {'tag': name.split(':')[-1], 'attrs': dict(attrs), 'children': [], 'parent': self.stack[-1]}
        self.stack[-1]['children'].append(node)
        if self.xml or name not in _void:
            self.stack.append(node)

    def handle_startendtag(self, name, attrs):
        self.handle_starttag(name, attrs)
        self.handle_endtag(name)

    def handle_endtag(self, name):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]['tag'] == name.split(':')[-1]:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1]['children'].append({'tag': '', 'data': data, 'children': []})

    def unknown_decl(self, data):
        if data.startswith('CDATA['):
            self.handle_data(data[6:])

def _walk(root):
    stack, count = [(root, 0)], 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > 50000 or depth > 128:
            raise ValueError('Search page exceeds parser node/depth limits')
        yield node
        if node['tag'] not in _excluded:
            stack.extend((child, depth + 1) for child in reversed(node['children']))

def _text(node):
    return re.sub(r'\s+', ' ', ''.join(child.get('data', ' ') if child['tag'] in {'p', 'div', 'li', 'br'} else child.get('data', '') for child in _walk(node))).strip()

def _has_class(node, names):
    return bool(set((node.get('attrs', {}).get('class') or '').split()) & names)

def _address(raw, base=''):
    try:
        url = urlsplit(urljoin(base, html.unescape(raw or '')))
        if url.hostname == 'duckduckgo.com' or (url.hostname or '').endswith('.duckduckgo.com'):
            target = parse_qs(url.query).get('uddg')
            if target:
                url = urlsplit(target[0])
        if url.scheme not in {'http', 'https'} or not url.hostname or url.username or url.password:
            return ''
        url.port
        return urlunsplit((url.scheme, url.netloc, url.path or '/', url.query, url.fragment))
    except ValueError:
        return ''

def parse_search_html(source, limit, provider, base):
    document = _Tree(str(source)).root
    rows, seen = [], set()
    for anchor in _walk(document):
        if anchor['tag'] != 'a':
            continue
        parent, heading, card, fallback, blocked = anchor.get('parent'), False, None, None, False
        while parent:
            name = parent['tag']
            if name in _excluded:
                blocked = True
                break
            heading = heading or name in {'h2', 'h3'}
            if card is None and _has_class(parent, _cards):
                card = parent
            if fallback is None and name in {'div', 'li', 'article'}:
                fallback = parent
            parent = parent.get('parent')
        if blocked or not (heading or _has_class(anchor, {'result__a'})) or (provider == 'bing_html' and card is None):
            continue
        url, title = _address(anchor['attrs'].get('href'), base), _text(anchor)
        if not url or not title or url in seen:
            continue
        container, snippet = card or fallback, ''
        if container is not None:
            nodes = list(_walk(container))
            if card is not None or sum(node['tag'] in {'h2', 'h3'} for node in nodes) <= 1:
                description = next((node for node in nodes if _has_class(node, _snippets)), None)
                if description is None:
                    description = next((node for node in nodes if node['tag'] == 'p'), None)
                if description is not None:
                    snippet = _text(description)[:2000]
        seen.add(url)
        rows.append({'title': title, 'url': url, 'snippet': snippet, 'provider': provider})
        if len(rows) >= limit:
            break
    return rows

def parse_search_feed(source, limit, provider='bing_rss'):
    value = str(source)
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', value.replace('\0', ''), re.I):
        raise ValueError('Search feed declarations are not allowed')
    nodes = list(_walk(_Tree(value, xml=True).root))
    if not any(node['tag'] in {'rss', 'feed'} for node in nodes):
        raise ValueError('Expected a search feed, received a non-feed page')
    rows = []
    for item in (node for node in nodes if node['tag'] == 'item'):
        def field(name):
            return next((node for node in item['children'] if node['tag'] == name), {'tag': '', 'children': []})
        def plain(node):
            return _text(_Tree(html.unescape(_text(node))).root)
        title, url = plain(field('title')), _address(_text(field('link')))
        if title and url:
            rows.append({'title': title, 'url': url, 'snippet': plain(field('description')), 'provider': provider})
        if len(rows) >= limit:
            break
    return rows

def candidate_limit(count, terms, kind):
    return max(count, 10) if terms and kind == 'free' else count
