import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chatSources, requiredTerms, paperItems } from '../search-quality.mjs';

const data = { choices: [{ message: { content: 'An AI summary, not an original page.', annotations: [{ type: 'url_citation', url_citation: { title: 'Original page', url: 'https://example.org/paper' } }] } }] };
const rows = chatSources(data, 'kimi', 'https://api.moonshot.cn/v1', 3);
assert.equal(rows[0].url, 'https://example.org/paper');
assert.equal(rows[0].source_type, 'provider_citation');
assert.match(rows[0].snippet, /AI-generated summary/);
assert.match(rows[0].verification, /unverified/);
assert.throws(() => chatSources({ choices: [{ message: { content: 'No citations supplied.' } }] }, 'kimi', 'https://api.moonshot.cn/v1', 3), /no original-source URLs/);
const content = '[Original](https://example.org/wiki/Topic_(test)). Also https://api.moonshot.cn/v1 and https://u:password@example.org/x';
const generated = chatSources({ choices: [{ message: { content } }] }, 'kimi', 'https://api.moonshot.cn/v1', 3);
assert.equal(generated.length, 1);
assert.equal(generated[0].url, 'https://example.org/wiki/Topic_(test)');
assert.equal(generated[0].source_type, 'model_link');
const candidates = [{ title: 'Python downloads', url: 'https://python.org', snippet: '' }, { title: 'asyncio.TaskGroup', url: 'https://docs.python.org', snippet: 'Added in 3.11' }];
assert.deepEqual(requiredTerms(candidates, []), candidates);
assert.deepEqual(requiredTerms(candidates, ['TaskGroup']), [candidates[1]]);
assert.deepEqual(requiredTerms(candidates, ['TaskGroup', 'missing']), []);
assert.deepEqual(requiredTerms([{ ...candidates[0], source_type: 'model_link', snippet: 'AI summary about TaskGroup' }], ['TaskGroup']), [], 'AI summary must not establish source relevance');
assert.throws(() => requiredTerms(candidates, ['']), /non-empty/);
assert.deepEqual(paperItems([{ type: 'component', title: ['supplement.docx'] }, { type: 'proceedings-article', title: ['Original paper'] }]), [{ type: 'proceedings-article', title: ['Original paper'] }]);
let result;
for (const python of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  result = spawnSync(python, [...(python === 'py' ? ['-3'] : []), 'tests/search-quality.py'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (!result.error && result.status !== 112) break;
}
assert.equal(result.status, 0, result.stderr || String(result.error));
assert.deepEqual(JSON.parse(result.stdout), rows);
console.log('Search source provenance and optional required-term parity passed');
