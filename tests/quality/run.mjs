import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => !['--browser', '--live', '--help'].includes(arg))) throw new Error('Unknown argument. Use --help.');
if (args.includes('--help')) {
  console.log('npm run quality -- [--browser] [--live]\nDefault: local fixtures. --browser: real browser against localhost. --live: free-provider searches and public HTTP reads, Node and Python. Reports: .quality/latest.json and latest.md. No Claude model is invoked.');
  process.exit(0);
}
const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
const report = {
  schema_version: 1, started_at: new Date().toISOString(), platform: process.platform, node: process.version,
  scope: 'MCP process tests; not a Claude Code end-to-end or native-tool comparison',
  suites: [], live: [],
  unmeasured: ['Native WebSearch/WebFetch + Playwright baseline', 'LLM tool selection and answer correctness', 'Search relevance and source credibility (human review)', 'Actual model tokens and billing', 'Real browser orphan process count', 'Provider recovery after cooldown expiry', 'Full offline and cross-platform matrix'],
};
// Retain bounded diagnostics without including child environment variables.
async function suite(id, script, coverage, mode, timeout = 180000) {
  const start = performance.now();
  let output = '', totalChars = 0;
  const child = spawn(process.execPath, [script], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = data => { const value = data.toString(); totalChars += value.length; output = (output + value).slice(-12000); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  const result = await new Promise(resolve => {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.once('error', error => { clearTimeout(timer); resolve({ status: 'failed', reason: error.code || 'spawn failed' }); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed', code, signal });
    });
  });
  const skipped = /skipping|unavailable/i.test(output);
  const row = { id, mode, coverage, elapsed_ms: Math.round(performance.now() - start), diagnostic_chars: totalChars,
    ...result, partial_coverage: skipped, diagnostics: output };
  report.suites.push(row);
  console.log(`${id}: ${row.status}${skipped ? ' (inspect skipped coverage)' : ''} ${row.elapsed_ms}ms`);
}
await suite('protocol-document', 'tests/mcp-regression.mjs', ['person-zh (mock only)', 'long-paper (synthetic PDF only)', 'rate-limit'], 'localhost + mock browser');
await suite('request-lifecycle', 'tests/safety-regression.mjs', ['network-timeout', 'cancel', 'browser close retry', 'DeepSeek response parsing (mock only)'], 'localhost + mock CLI');
await suite('owner-watch', 'tests/browser-owner.mjs', ['owner-exit (mock daemon only)'], 'local processes');
await suite('security-boundaries', 'tests/p0.mjs', ['private addresses', 'redirects', 'write permissions', 'credential storage'], 'localhost + real OS permissions');
if (args.includes('--browser')) {
  await suite('rendered-browser', 'tests/browser-live-smoke.mjs', ['dynamic-page'], 'real browser + localhost');
  await suite('real-owner-exit', 'tests/browser-lifecycle.mjs', ['owner-exit (real browser and daemon PIDs)'], 'real browser + localhost');
  report.unmeasured = report.unmeasured.filter(value => value !== 'Real browser orphan process count');
}
if (args.includes('--live')) {
  const { runLive } = await import('./live.mjs');
  report.live = await runLive(root, cases.filter(item => item.live));
}
report.finished_at = new Date().toISOString();
report.suite_pass_rate = report.suites.filter(row => row.status === 'passed').length / report.suites.length;
report.search_relevance_rate = null;
report.read_accuracy_rate = null;
const md = [
  '# Quality Report', '', `Started: ${report.started_at}`, `Platform: ${report.platform}; Node: ${report.node}`, '',
  report.scope, '', '## Automated Suites', '',
  '| Suite | Mode | Status | Time (ms) | Partial coverage |', '| --- | --- | --- | ---: | --- |',
  ...report.suites.map(row => `| ${row.id} | ${row.mode} | ${row.status} | ${row.elapsed_ms} | ${row.partial_coverage} |`), '',
  'Elapsed time is for the whole suite, not individual cases. Diagnostic characters are test logs, not model context or tokens. A passing mocked search does not measure real search relevance.', '',
  '## Live MCP Measurements', '',
  ...(report.live.length ? ['| Runtime | Case | Status | Time (ms) | Text chars | Returned URLs |', '| --- | --- | --- | ---: | ---: | ---: |',
    ...report.live.map(row => `| ${row.runtime} | ${row.case_id} | ${row.status} | ${row.elapsed_ms} | ${row.output_chars ?? '-'} | ${row.returned_url_count ?? '-'} |`)] : ['Not run. Use --live to opt in to public web requests.']), '',
  'Returned URLs and successful HTTP reads require human relevance checks. They do not establish that sources support an answer.', '',
  '## Not Measured', '', ...report.unmeasured.map(value => '- ' + value), '',
  '## Fixed Acceptance Cases', '', ...cases.flatMap(item => [`### ${item.id}`, '', item.prompt, '', item.acceptance, '']),
].join('\n');
await mkdir(path.join(root, '.quality'), { recursive: true });
await writeFile(path.join(root, '.quality/latest.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(root, '.quality/latest.md'), md + '\n');
const columns = ['arm', 'case_id', 'status', 'reviewed_urls', 'relevant_urls', 'attempted_reads', 'successful_reads', 'first_useful_source_ms', 'total_ms', 'tool_text_chars', 'actual_tokens', 'owned_processes_left', 'actual_cost', 'evidence'];
const comparison = [columns.join(','), ...cases.flatMap(item => ['native-playwright', 'net-tools'].map(arm => [arm, item.id, 'unmeasured', ...Array(columns.length - 3).fill('')].join(',')))].join('\n') + '\n';
try { await writeFile(path.join(root, '.quality/comparison.csv'), comparison, { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
console.log('Report: .quality/latest.md and .quality/latest.json');
if (report.suites.some(row => row.status !== 'passed') || report.live.some(row => ['error', 'provider_error'].includes(row.status))) process.exitCode = 1;
