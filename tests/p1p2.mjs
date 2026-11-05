import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evidence } from '../document-evidence.mjs';
import { claim, complete, ready } from '../provider-health.mjs';

const stats = { consecutiveFailures: 3 };
claim(stats, 1000);
complete(stats, false, 'HTTP 429', 1000);
assert.equal(ready(stats, 1001), false);
assert.throws(() => claim(stats, 1001), /cooldown/);
assert.equal(ready(stats, stats.retryAt), true);
claim(stats, stats.retryAt);
assert.equal(ready(stats, stats.retryAt), false, 'one recovery probe at a time');
complete(stats, true, '', stats.retryAt);
assert.equal(ready(stats, 9999999), true);
assert.equal(stats.retryAt, 0);

const cases = JSON.parse(readFileSync(new URL('../contracts/quality.json', import.meta.url))).document_cases;
const results = cases.map(item => evidence(item.document, item.arguments));
for (let i = 0; i < cases.length; i++) {
  const item = cases[i], result = results[i];
  assert.equal(result.matches.length, item.expected_count, item.id);
  assert.equal(result.offset_unit, 'unicode_code_point');
  for (const match of result.matches) {
    const chars = Array.from(item.document.content);
    assert.equal(chars.slice(match.start, match.end).join(''), match.quote);
    assert.equal(chars.slice(match.excerpt_start, match.excerpt_end).join(''), match.excerpt);
    if (item.expected_page) assert.equal(match.page, item.expected_page);
    if (item.expected_section) assert.equal(match.section_hint, item.expected_section);
  }
}
const repeated = { id: 'repeated', content: 'needle '.repeat(100), final_url: 'https://example.org/doc', kind: 'page' };
const page1 = evidence(repeated, { query: 'needle', max_matches: 2 });
const page2 = evidence(repeated, { query: 'needle', max_matches: 2, match_offset: page1.next_match_offset });
assert.ok(page2.matches[0].start > page1.matches.at(-1).start);
assert.throws(() => evidence(repeated, { query: '' }), /non-empty/);
assert.throws(() => evidence(repeated, { query: 'needle', quote: 'needle' }), /either/);
assert.equal(evidence(repeated, { quote: 'absent' }).matched, false);
assert.equal(evidence({ ...repeated, content: 'x'.repeat(2000) }, { quote: 'x'.repeat(1000), max_chars: 500 }).matches.length, 0);

let check;
for (const python of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  check = spawnSync(python, [...(python === 'py' ? ['-3'] : []), 'tests/p1p2.py'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (!check.error && check.status !== 112) break;
}
assert.equal(check.status, 0, check.stderr || String(check.error || 'Python failed'));
assert.deepEqual(JSON.parse(check.stdout), results, 'Node/Python evidence contract parity');
console.log('P1/P2: provider cooldown, recovery, exact evidence, pagination and runtime parity passed');
