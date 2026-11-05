import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseSearchHtml, parseSearchFeed, candidateLimit } from '../search-pages.mjs';
import { requiredTerms } from '../search-quality.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/search-pages.json', import.meta.url)));
const rows = fixtures.map(f => f.rss ? parseSearchFeed(f.rss, 10, f.provider) : parseSearchHtml(f.html, 10, f.provider, f.base));
fixtures.forEach((f, index) => assert.deepEqual(rows[index], f.expected, f.id));
assert.equal(requiredTerms(rows[1], ['TaskGroup']).length, 1, 'retained snippet makes the relevant source discoverable');
assert.equal(candidateLimit(3, ['TaskGroup'], 'free'), 10);
assert.equal(candidateLimit(3, ['TaskGroup'], 'api'), 3, 'never increase paid-provider result count');
assert.equal(candidateLimit(3, [], 'free'), 3);
assert.throws(() => parseSearchFeed('<html><body>Error</body></html>', 3), /feed/);
assert.throws(() => parseSearchFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>', 3), /declaration/);
assert.throws(() => parseSearchHtml('<div>'.repeat(200) + '</div>'.repeat(200), 3, 'bing_html', 'https://example.org'), /limits/);
assert.throws(() => parseSearchFeed('<rss>' + 'x'.repeat(2000000) + '</rss>', 3), /input limit/);
let check;
for (const command of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  check = spawnSync(command, [...(command === 'py' ? ['-3'] : []), 'tests/search-pages.py'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (!check.error && check.status !== 112) break;
}
assert.equal(check.status, 0, check.stderr || String(check.error));
assert.deepEqual(JSON.parse(check.stdout), rows, 'cross-runtime search-page parsing');
console.log('Organic result cards, snippets, safe feeds and candidate-limit parity passed');
