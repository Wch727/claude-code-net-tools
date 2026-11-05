import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runLive } from './live.mjs';
import { diagnose } from './search-diagnostics.mjs';
import { writeSearchReport } from './search-report.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = new Map();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (!['--run', '--help', '--limit', '--mode', '--runtime', '--reads', '--case'].includes(flag) || flags.has(flag)) throw new Error('Unknown or duplicate flag: ' + flag);
  if (['--run', '--help'].includes(flag)) flags.set(flag, true);
  else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + flag); flags.set(flag, args[++i]); }
}
const mode = flags.get('--mode') || 'baseline';
const runtime = flags.get('--runtime') || 'all';
const limit = Number(flags.get('--limit') || 3);
const reads = Number(flags.get('--reads') || 0);
if (!['baseline', 'terms'].includes(mode) || !['node', 'python', 'all'].includes(runtime) || !Number.isInteger(limit) || limit < 1 || limit > 30 || ![0, 1].includes(reads)) throw new Error('Invalid mode/runtime/limit/reads. Use --help.');
const rawCases = await readFile(new URL('./search-cases.json', import.meta.url), 'utf8');
const cases = JSON.parse(rawCases);
const ids = flags.get('--case')?.split(',');
if (ids?.some(id => !cases.some(item => item.id === id))) throw new Error('Unknown case ID.');
const selected = cases.filter(item => !ids || ids.includes(item.id)).slice(0, limit);
if (!flags.has('--run') || flags.has('--help')) {
  console.log('node tests/quality/search-eval.mjs --run [--limit 3|30] [--mode baseline|terms] [--runtime all|node|python] [--reads 0|1] [--case taskgroup,person-mayb]\nNo network without --run. Free providers only; no model/browser. Default is 3 cases, both runtimes, no reads. --reads 1 fetches only the first returned URL, not a full answer.');
  console.log('Cases: ' + selected.map(item => item.id).join(', '));
  process.exit(0);
}
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const commit = git(['rev-parse', 'HEAD']), state = git(['status', '--porcelain']);
const report = { schema_version: 1, started_at: new Date().toISOString(), version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
  commit: commit.status === 0 ? commit.stdout.trim() : null, git_dirty: state.status === 0 ? !!state.stdout.trim() : null,
  dataset_sha256: createHash('sha256').update(rawCases).digest('hex'), dataset_size: cases.length, selected_cases: selected.map(item => item.id), mode, runtime, read_top: reads,
  scope: 'Direct MCP baseline, not Claude Code tool selection, query rewrite, native WebSearch comparison or a measured accuracy claim. No paid provider/model/browser selected.' };
await mkdir(path.join(root, '.quality'), { recursive: true });
const journal = path.join(root, `.quality/search-eval-${mode}-${runtime}.partial.jsonl`);
await writeFile(journal, JSON.stringify({ run: report }) + '\n');
const rows = await runLive(root, selected.map(item => ({ ...item, category: 'search', live: { tool: 'web_search', arguments: {
  query: item.query, intent: item.intent, count: 3, time_budget: 20, browser: 'never', verify_top: 0,
  providers: item.intent === 'academic' ? ['crossref', 'arxiv'] : ['bing_rss', 'duckduckgo', 'bing_html'],
  ...(mode === 'terms' ? { required_terms: item.terms } : {}),
} } })), { runtime, readTop: reads, onRow: async row => {
  await appendFile(journal, JSON.stringify(row) + '\n');
  console.log(JSON.stringify({ runtime: row.runtime, case_id: row.case_id, status: row.status, elapsed_ms: row.elapsed_ms, causes: diagnose(row).causes }));
} });
for (const row of rows) {
  const item = selected.find(item => item.id === row.case_id);
  row.query = item?.query || null;
  row.question = item?.question || null;
  row.split = item?.split || null;
  row.review_criteria = item?.review || null;
  row.diagnosis = diagnose(row);
  row.review = { relevant_top3: null, supported_answer: null, reviewer: null, reason: null };
}
report.rows = rows;
report.finished_at = new Date().toISOString();
await writeSearchReport(root, report);
console.log(`Report: .quality/search-eval-${mode}-${runtime}.json and .md`);
if (rows.some(row => ['error', 'provider_error'].includes(row.status))) process.exitCode = 1;
