import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnose, summarize, providerErrors } from './search-diagnostics.mjs';

export async function writeSearchReport(root, report) {
  if (report.schema_version !== 1 || !Array.isArray(report.rows) || !['baseline', 'terms'].includes(report.mode) || !['all', 'node', 'python'].includes(report.runtime)) throw new Error('Unsupported search report.');
  const rows = report.rows;
  for (const row of rows) {
    row.provider_errors_detected = providerErrors(row.provider_notes || []);
    // Reclassify preserved observations, never alter engine results or human labels.
    if (['empty', 'provider_error'].includes(row.status)) row.status = row.provider_errors_detected ? 'provider_error' : 'empty';
    row.diagnosis = diagnose(row);
  }
  report.diagnostics_version = 1;
  report.diagnostics_rebuilt_at = new Date().toISOString();
  report.metrics = Object.fromEntries([...new Set(rows.map(row => row.runtime))].map(runtime => [runtime, summarize(rows.filter(row => row.runtime === runtime && row.query != null && row.status !== 'skipped'))]));
  const escape = value => String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
  const md = ['# Search Failure Baseline', '', `${report.version}; commit ${report.commit}; dirty=${report.git_dirty}; ${report.started_at}`, '', report.scope, '',
    `Selected ${report.selected_cases.length}/${report.dataset_size} cases, mode=${report.mode}. A partial sample is not an overall quality estimate.`, '',
    '| Runtime | Case | Status | URLs | Search ms | Empty stage | Observed causes |', '| --- | --- | --- | ---: | ---: | --- | --- |',
    ...rows.map(row => `| ${row.runtime} | ${row.case_id} | ${row.status} | ${row.returned_url_count ?? '-'} | ${row.elapsed_ms} | ${row.diagnosis.empty_stage || '-'} | ${row.diagnosis.causes.join(', ')} |`), '',
    'Metrics: ' + JSON.stringify(report.metrics), '',
    'P@3 and task success are UNREVIEWED, not zero or inferred from URL counts. Parsed counts come from MCP notes, not raw engine recall. An empty parsed feed cannot distinguish upstream zero from an unrecognized page structure without raw-response inspection. Multiple failure causes can coexist. HTTP reachability or literal presence does not establish evidence support.', '',
    ...rows.flatMap(row => [`## ${row.runtime}: ${row.case_id}`, '', escape(row.question), '', `Review: ${escape(row.review_criteria)}`, '',
      ...(row.results || []).map((result, index) => `${index + 1}. ${escape(result.title)}: ${escape(result.url)} - ${escape(result.snippet)}`), '',
      ...(row.provider_notes || []).map(note => '- ' + escape(note)), '',
      ...(row.reads || []).map(read => `Read: ${escape(read.url)}; ${read.status}; literal=${read.literal_matched ?? 'unknown'}; ${read.elapsed_ms}ms; ${escape(read.reason || read.excerpt)}`), '']),
  ].join('\n');
  await mkdir(path.join(root, '.quality'), { recursive: true });
  const target = path.join(root, `.quality/search-eval-${report.mode}-${report.runtime}`);
  await writeFile(target + '.json', JSON.stringify(report, null, 2) + '\n');
  await writeFile(target + '.md', md + '\n');
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Offline only: node tests/quality/search-report.mjs .quality/search-eval-baseline-node.json');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const report = JSON.parse(await readFile(path.resolve(process.argv[2]), 'utf8'));
  console.log('Rebuilt offline: ' + await writeSearchReport(root, report));
}
