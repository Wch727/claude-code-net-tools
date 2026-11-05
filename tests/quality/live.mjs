import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { providerErrors as observedProviderErrors } from './search-diagnostics.mjs';

// This path never calls a model or selects a paid search provider.
export async function runLive(root, cases, options = {}) {
  const runtimes = [{ name: 'node', command: process.execPath, args: ['claude_net_mcp.mjs'] }];
  for (const command of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const prefix = command === 'py' ? ['-3'] : [];
    const probe = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info.major)'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (!probe.error && probe.status === 0 && probe.stdout.trim() === '3') { runtimes.push({ name: 'python', command, args: [...prefix, 'claude_net_mcp.py'] }); break; }
  }
  const selected = runtimes.filter(runtime => !options.runtime || options.runtime === 'all' || options.runtime === runtime.name);
  const rows = [];
  const record = async row => { rows.push(row); await options.onRow?.(row); };
  if (runtimes.length < 2 && options.runtime !== 'node') await record({ runtime: 'python', case_id: 'all', status: 'skipped', elapsed_ms: 0, reason: 'Python 3 unavailable' });
  for (const runtime of selected) {
    const child = spawn(runtime.command, runtime.args, { cwd: root, env: { ...process.env, CLAUDE_NET_SEARCH_PROVIDERS: 'duckduckgo,bing_rss', CLAUDE_NET_BROWSER_FALLBACK: 'never' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', id = 0;
    const pending = new Map();
    const fail = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('MCP process exited or failed')); } pending.clear(); };
    child.once('error', fail); child.once('exit', fail);
    child.stderr.resume();
    child.stdin.on('error', fail);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message; try { message = JSON.parse(line); } catch { fail(); continue; }
        const item = pending.get(message.id);
        if (item) { clearTimeout(item.timer); pending.delete(message.id); item.resolve(message); }
      }
    });
    const request = (method, params) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId } }) + '\n'); reject(new Error('MCP request timed out')); }, 45000);
      pending.set(requestId, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
    try {
      const init = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'quality-live', version: '1' } });
      if (init.error) throw new Error('Initialization failed');
      for (const item of cases) {
        const start = performance.now();
        try {
          const response = await request('tools/call', { name: item.live.tool, arguments: item.live.arguments });
          const text = (response.result?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
          const data = response.result?.structuredContent;
          const urls = [...new Set((data?.results || []).map(row => row.url).filter(Boolean))];
          const notes = data?.notes || [];
          const providerErrors = item.category === 'search' && observedProviderErrors(notes);
          const row = { runtime: runtime.name, case_id: item.id, status: response.error || response.result?.isError ? 'error' : data?.mode && data.matched !== true ? 'evidence_missing' : urls.length || item.category !== 'search' ? 'returned' : providerErrors ? 'provider_error' : 'empty',
            elapsed_ms: Math.round(performance.now() - start), output_chars: text.length, returned_url_count: urls.length, urls,
            results: (data?.results || []).map(row => ({ title: row.title, url: row.url, provider: row.provider, snippet: String(row.snippet || '').slice(0, 500) })),
            provider_errors_detected: !!providerErrors, provider_notes: notes,
            source_relevance: null, answer_correctness: null, text_excerpt: text.slice(0, 4000), reads: [], mcp_tool_calls: 1 };
          for (const url of urls.slice(0, Math.max(0, Math.min(1, options.readTop || 0)))) {
            const readStart = performance.now();
            row.mcp_tool_calls++;
            try {
              const read = await request('tools/call', { name: 'read_url', arguments: { url, browser: 'never', timeout: 10, max_chars: 1500,
                ...(item.evidence_term ? { query: item.evidence_term, max_matches: 1 } : {}) } });
              const document = read.result?.structuredContent;
              const content = (read.result?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
              const httpStatus = Number.parseInt(document?.status, 10);
              const failed = read.error || read.result?.isError || Number.isFinite(httpStatus) && (httpStatus < 200 || httpStatus >= 400);
              row.reads.push({ url, final_url: document?.final_url || null, status: failed ? 'error' : httpStatus >= 200 && document?.total_chars > 0 ? 'returned' : 'unverified', http_status: Number.isFinite(httpStatus) ? httpStatus : null,
                elapsed_ms: Math.round(performance.now() - readStart), literal_matched: document?.matched ?? null,
                document_id: document?.document_id || null, evidence: (document?.matches || []).slice(0, 1), excerpt: content.slice(0, 1800) });
            } catch (error) { row.reads.push({ url, status: 'error', elapsed_ms: Math.round(performance.now() - readStart), reason: error.message }); }
          }
          await record(row);
        } catch (error) { await record({ runtime: runtime.name, case_id: item.id, status: 'error', elapsed_ms: Math.round(performance.now() - start), reason: error.message }); }
      }
    } catch (error) { await record({ runtime: runtime.name, case_id: 'initialize', status: 'error', elapsed_ms: 0, reason: error.message }); }
    finally {
      let shutdownTimedOut = false;
      await new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        let reapTimer;
        const timer = setTimeout(() => { shutdownTimedOut = true; child.kill(); reapTimer = setTimeout(resolve, 2000); }, 15000);
        child.once('exit', () => { clearTimeout(timer); clearTimeout(reapTimer); resolve(); }); child.stdin.end();
      });
      fail();
      if (shutdownTimedOut) await record({ runtime: runtime.name, case_id: 'shutdown', status: 'error', elapsed_ms: 15000, reason: 'MCP exceeded shutdown budget; termination requested', reaped: child.exitCode !== null || child.signalCode !== null });
    }
  }
  return rows;
}
