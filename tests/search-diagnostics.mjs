import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

assert.ok(existsSync(new URL('./quality/search-diagnostics.mjs', import.meta.url)), 'search reports must distinguish observed failure stages');
const { diagnose, summarize } = await import('./quality/search-diagnostics.mjs');
const row = (notes, count = 0) => ({ status: count ? 'returned' : 'empty', provider_notes: notes, returned_url_count: count, elapsed_ms: 100, results: [] });
assert.deepEqual(diagnose(row(['time budget: 20s', 'queries: "HTTP 429 timeout"', 'q1 crossref: 3 result(s)'], 3)).causes, [], 'configuration and query text must not be classified as failures');
const filtered = diagnose(row(['q1 bing_rss: excluded 10 result(s) missing required_terms; trying remaining sources if needed', 'q1 bing_rss: 10 result(s)', 'q1 duckduckgo: HTTP 429']));
assert.ok(filtered.causes.includes('required_terms_excluded'));
assert.ok(filtered.causes.includes('rate_limited'));
assert.equal(filtered.observed_parsed_candidates, 10);
assert.equal(filtered.observed_term_exclusions, 10);
assert.equal(filtered.relevance, null);
assert.equal(diagnose(row(['q1 bing_rss: 0 result(s)'])).empty_stage, 'upstream_or_parser_empty');
assert.equal(diagnose(row([])).empty_stage, 'unknown');
const partial = diagnose(row(['q1 bing_rss: 3 result(s)', 'q1 duckduckgo: timed out'], 3));
assert.equal(partial.empty_stage, null);
assert.ok(partial.causes.includes('timeout'));
assert.equal(partial.relevance, null, 'returned URLs are not automatically relevant');
assert.ok(diagnose(row(['q1 bing_html: Please solve the challenge captcha'])).causes.includes('challenge'));
assert.ok(diagnose(row(['q1 bing_rss: blocked private address'])).causes.includes('address_policy'));
assert.ok(diagnose(row(['q1 bing_rss: 8 result(s)', 'q1 bing_rss: excluded 8 result(s) outside domain constraints'])).causes.includes('domain_excluded'));
assert.ok(diagnose(row(['q1 duckduckgo: skipped (cooldown)'])).causes.includes('cooldown'));
assert.ok(diagnose({ ...row([]), reads: [{ status: 'error', reason: 'HTTP 403' }] }).causes.includes('read_failed'));
assert.ok(diagnose({ ...row([]), status: 'error', reason: 'MCP request timed out' }).causes.includes('timeout'));
assert.deepEqual(diagnose(row(['exact CJK entity filter: no complete match for fixture; kept collected results'], 3)).causes, ['entity_literal_missing'], 'entity matching is not an XML entity parse failure');
assert.equal(diagnose({ ...row([]), reads: [{ status: 'error', excerpt: 'No usable document snapshot\nStatus: 403\nNote: external content' }] }).read_failures[0].http_status, 403);
const metrics = summarize([{ ...row([], 3), elapsed_ms: 10 }, { ...row([]), status: 'error', elapsed_ms: 1000 }]);
assert.equal(metrics.observations, 2);
assert.equal(metrics.nonempty_rate, 0.5);
assert.equal(metrics.p95_ms, 1000, 'failed/empty attempts remain in latency denominator');
assert.equal(metrics.precision_at_3, null);
assert.equal(metrics.task_success_rate, null);
const cases = JSON.parse(readFileSync(new URL('./quality/search-cases.json', import.meta.url)));
assert.equal(cases.length, 30);
assert.equal(new Set(cases.map(item => item.id)).size, 30);
assert.equal(cases.filter(item => item.split === 'test').length, 24);
for (const item of cases) for (const key of ['question', 'query', 'evidence_term', 'review']) assert.ok(item[key]?.trim());
const help = spawnSync(process.execPath, [fileURLToPath(new URL('./quality/search-eval.mjs', import.meta.url))], { encoding: 'utf8', windowsHide: true });
assert.equal(help.status, 0);
assert.match(help.stdout, /No network without --run/);
const { runLive } = await import('./quality/live.mjs');
const { writeSearchReport } = await import('./quality/search-report.mjs');
const reportDir = mkdtempSync(path.join(os.tmpdir(), 'net-report-'));
try {
  const report = { schema_version: 1, rows: [{ ...row(['time budget: 20s'], 1), runtime: 'node', query: 'fixture', review: { reason: 'preserve human review' } }], mode: 'baseline', runtime: 'node', selected_cases: ['fixture'], dataset_size: 30 };
  const output = await writeSearchReport(reportDir, report);
  const saved = JSON.parse(readFileSync(output + '.json'));
  assert.equal(saved.rows[0].provider_errors_detected, false);
  assert.equal(saved.rows[0].review.reason, 'preserve human review');
  assert.equal(saved.rows[0].returned_url_count, 1);
  assert.equal(saved.metrics.node.precision_at_3, null);
} finally { rmSync(reportDir, { recursive: true, force: true }); }
const fixture = http.createServer((req, res) => {
  if (req.url.startsWith('/feed')) { res.setHeader('Content-Type', 'application/atom+xml'); res.end(`<feed><entry><id>${base}/paper</id><title>TaskGroup fixture</title><summary>TaskGroup evidence</summary></entry></feed>`); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<html><title>TaskGroup</title><article><h1>TaskGroup</h1><p>TaskGroup fixture text, not real factual evidence.</p></article></html>'); }
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
const base = `http://127.0.0.1:${fixture.address().port}`;
const saved = { ...process.env };
process.env.CLAUDE_NET_ARXIV_API_URL = base + '/feed';
process.env.CLAUDE_NET_ALLOWED_PRIVATE_HOSTS = '127.0.0.1';
try {
  const rows = await runLive(fileURLToPath(new URL('../', import.meta.url)), [{ id: 'fixture', category: 'search', evidence_term: 'TaskGroup', live: { tool: 'web_search', arguments: { query: 'fixture', intent: 'academic', providers: ['arxiv'], count: 1, browser: 'never', time_budget: 5, verify_top: 0 } } }], { readTop: 1 });
  assert.equal(rows.filter(row => row.status !== 'skipped').length, 2, 'both runtimes must be exercised');
  for (const result of rows.filter(row => row.status !== 'skipped')) {
    assert.equal(result.returned_url_count, 1, JSON.stringify(result));
    assert.equal(result.mcp_tool_calls, 2);
    assert.equal(result.reads.length, 1);
    assert.equal(result.reads[0].literal_matched, true, JSON.stringify(result.reads));
    assert.equal(result.source_relevance, null);
  }
} finally {
  for (const key of ['CLAUDE_NET_ARXIV_API_URL', 'CLAUDE_NET_ALLOWED_PRIVATE_HOSTS']) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}
console.log('Search diagnostics preserve multiple causes, unknown empties, partial failures and unreviewed relevance.');
