// Observations from existing MCP notes, not a claim about unobserved raw responses.
export function diagnose(row) {
  const notes = [...(row.provider_notes || []), ...(row.reason ? [row.reason] : [])];
  const providers = new Map();
  const causes = new Set();
  let parsed = null, terms = 0, domains = 0;
  for (const note of notes) {
    if (/^(?:mode|intent|queries|time budget|browser|verification):/.test(note)) continue;
    const match = note.match(/^(?:q(\d+)\s+)?([a-z][a-z_0-9]*):\s*(.*)$/);
    if (match && !['mode', 'intent', 'queries', 'browser', 'verification'].includes(match[2])) {
      const [, query = '1', provider, detail] = match;
      const key = query + ':' + provider;
      const entry = providers.get(key) || { query_index: Number(query), provider, parsed_count: null, term_exclusions: 0, domain_exclusions: 0, notes: [] };
      entry.notes.push(detail);
      const count = detail.match(/^(\d+) result\(s\)$/);
      const term = detail.match(/^excluded (\d+) result\(s\) missing required_terms/);
      const domain = detail.match(/^excluded (\d+) result\(s\) outside domain constraints/);
      if (count) { entry.parsed_count = Number(count[1]); parsed = (parsed ?? 0) + entry.parsed_count; }
      if (term) { entry.term_exclusions += Number(term[1]); terms += Number(term[1]); causes.add('required_terms_excluded'); }
      if (domain) { entry.domain_exclusions += Number(domain[1]); domains += Number(domain[1]); causes.add('domain_excluded'); }
      providers.set(key, entry);
    }
    if (/cooldown|circuit.*open/i.test(note)) { causes.add('cooldown'); continue; }
    if (/HTTP 429|rate.limit/i.test(note)) causes.add('rate_limited');
    if (/captcha|antispider|challenge|验证码/i.test(note)) causes.add('challenge');
    if (/private.*address|address.*(?:policy|blocked)|unsafe.*address|non.public|blocked.*(?:host|address)|disallowed.*(?:ip|address)/i.test(note)) causes.add('address_policy');
    if (/timed? out|timeout/i.test(note)) causes.add('timeout');
    if (/time budget (?:exhausted|reached)|deadline/i.test(note)) causes.add('deadline');
    if (/exact CJK entity filter: no complete match/i.test(note)) causes.add('entity_literal_missing');
    if (/HTTP (?:4|5)\d\d/i.test(note) && !/HTTP 429/.test(note)) causes.add('http_error');
    if (/ENOTFOUND|EAI_AGAIN|DNS|name resolution/i.test(note)) causes.add('dns_error');
    if (/not (?:an? )?(?:RSS|feed)|DOCTYPE|\bDTD\b|<!ENTITY\b|\bentity declaration\b|parser input|parse.*(?:error|failed)/i.test(note)) causes.add('parse_error');
  }
  if (['error', 'provider_error'].includes(row.status)) causes.add('request_or_provider_error');
  if ((row.reads || []).some(read => read.status === 'error')) causes.add('read_failed');
  if ((row.reads || []).some(read => read.status === 'unverified')) causes.add('read_unverified');
  if ((row.reads || []).some(read => read.literal_matched === false)) causes.add('read_literal_missing');
  const nonempty = (row.returned_url_count || 0) > 0;
  const emptyStage = nonempty ? null : terms + domains > 0 ? 'constraints_removed_candidates'
    : parsed === 0 ? 'upstream_or_parser_empty' : causes.size ? 'failure_observed' : 'unknown';
  const readFailures = (row.reads || []).filter(read => read.status === 'error').map(read => {
    const text = read.reason || read.excerpt || '';
    const status = read.http_status ?? Number(text.match(/^Status:\s*(\d{3})/m)?.[1]);
    return { url: read.url, http_status: Number.isFinite(status) && status > 0 ? status : null,
      address_policy: /private or non-global network address blocked|private.*address.*blocked/i.test(text),
      snapshot_unavailable: /No usable document snapshot/i.test(text) };
  });
  return { empty_stage: emptyStage, causes: [...causes], observed_parsed_candidates: parsed,
    observed_term_exclusions: terms, observed_domain_exclusions: domains, providers: [...providers.values()], read_failures: readFailures, relevance: null,
    limit: 'Parsed counts are provider/query observations, not unique URLs or raw search-engine recall. Mixed failures can coexist. Relevance and task success need review.' };
}

export function providerErrors(notes) {
  const errors = new Set(['rate_limited', 'challenge', 'address_policy', 'timeout', 'deadline', 'cooldown', 'http_error', 'dns_error', 'parse_error']);
  return diagnose({ provider_notes: notes }).causes.some(cause => errors.has(cause));
}

export function summarize(rows) {
  const times = rows.map(row => row.elapsed_ms).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => times.length ? times[Math.max(0, Math.ceil(times.length * p) - 1)] : null;
  return { observations: rows.length, nonempty_rate: rows.length ? rows.filter(row => row.returned_url_count > 0).length / rows.length : null,
    p50_ms: percentile(0.5), p95_ms: percentile(0.95), latency_observations: times.length,
    precision_at_3: null, task_success_rate: null, provider_http_requests: null, actual_model_tokens: null, actual_cost: null,
    note: 'Nonempty is not relevant. Latencies include failed/empty search calls, exclude optional reads, and describe only the selected sample; tiny samples do not estimate production P95.' };
}
