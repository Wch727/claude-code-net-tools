import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from search_pages import parse_search_html, parse_search_feed, candidate_limit

fixtures = json.loads((Path(__file__).parent / 'fixtures/search-pages.json').read_text(encoding='utf-8'))
rows = [parse_search_feed(f['rss'], 10, f['provider']) if 'rss' in f else parse_search_html(f['html'], 10, f['provider'], f['base']) for f in fixtures]
assert candidate_limit(3, ['TaskGroup'], 'free') == 10
assert candidate_limit(3, ['TaskGroup'], 'api') == 3
for text in ('<html>Error</html>', '<!DOCTYPE rss [<!ENTITY x "expanded">]><rss/>'):
    try:
        parse_search_feed(text, 3)
    except ValueError:
        pass
    else:
        raise AssertionError('invalid feed must not count as empty success')
print(json.dumps(rows, ensure_ascii=True))
