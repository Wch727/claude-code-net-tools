import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runLive } from './live.mjs';
import { spawnSync } from 'node:child_process';

if (!process.argv.includes('--run')) {
  console.log('node tests/quality/search-live.mjs --run\nFree-provider public requests only; no model or paid search API. Output: .quality/search-latest.json');
  process.exit(0);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const cases = [
  { id: 'identifier', literal: 'TaskGroup', arguments: { query: 'TaskGroup asyncio Python', required_terms: ['TaskGroup'], providers: ['bing_rss', 'duckduckgo', 'bing_html'] } },
  { id: 'person-zh', literal: '\u9a6c\u5f66\u5f6a', arguments: { query: '\u9a6c\u5f66\u5f6a', providers: ['bing_rss', 'sogou'] } },
  { id: 'original-paper', literal: 'Pre-training of Deep Bidirectional', arguments: { query: 'BERT Pre-training of Deep Bidirectional Transformers for Language Understanding', intent: 'academic', required_terms: ['Bidirectional'], providers: ['crossref', 'arxiv'] } },
];
const rows = await runLive(root, cases.map(item => ({ id: item.id, category: 'search', live: { tool: 'web_search', arguments: { count: 3, time_budget: 20, browser: 'never', verify_top: 0, ...item.arguments } } })));
for (const row of rows) {
  const literal = cases.find(item => item.id === row.case_id)?.literal.toLowerCase();
  row.literal_match_count = literal ? (row.results || []).filter(item => (item.title + ' ' + item.url + ' ' + item.snippet).toLowerCase().includes(literal)).length : null;
  console.log(JSON.stringify({ runtime: row.runtime, case_id: row.case_id, status: row.status, elapsed_ms: row.elapsed_ms, urls: row.urls, literal_match_count: row.literal_match_count, notes: row.provider_notes }));
}
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const commit = git(['rev-parse', 'HEAD']), status = git(['status', '--porcelain']);
const report = { at: new Date().toISOString(), version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
  commit: commit.status === 0 ? commit.stdout.trim() : null, git_dirty: status.status === 0 ? !!status.stdout.trim() : null,
  limitation: 'Literal presence is not semantic relevance, independent corroboration, answer correctness or publisher trust. No Claude model was called.', rows };
await mkdir(path.join(root, '.quality'), { recursive: true });
await writeFile(path.join(root, '.quality/search-latest.json'), JSON.stringify(report, null, 2) + '\n');
if (rows.some(row => ['error', 'provider_error'].includes(row.status))) process.exitCode = 1;
