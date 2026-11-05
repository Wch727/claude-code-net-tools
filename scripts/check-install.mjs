import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ is required.');
  if (!process.argv.includes('--runtime-only')) {
    for (const name of ['ipaddr.js', 'htmlparser2', 'entities']) {
      try { await import(name); }
      catch { throw new Error('Missing or unusable Node dependency ' + name + '. Run npm ci in the repository, or rerun the installer with -InstallDependencies / --install-dependencies.'); }
    }
    const curl = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    if (curl.error || curl.status !== 0) throw new Error('curl is required for Node HTTP requests. Install curl and check curl --version.');
    const input = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'install-check', version: '1' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }].map(row => JSON.stringify(row)).join('\n') + '\n';
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../claude_net_mcp.mjs', import.meta.url))], {
      input, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1000000,
      env: { ...process.env, CLAUDE_NET_TOOL_PROFILE: 'compact' },
    });
    if (run.error || run.status !== 0) throw new Error('Node MCP startup failed or exceeded 10 seconds; run node claude_net_mcp.mjs to diagnose.');
    const rows = run.stdout.trim().split('\n').map(line => JSON.parse(line));
    if (!rows.find(row => row.id === 1)?.result?.serverInfo || !rows.find(row => row.id === 2)?.result?.tools?.some(tool => tool.name === 'web_search')) throw new Error('Node MCP initialize/tools/list check failed.');
    console.log('Node preflight passed: runtime, core dependencies, curl and MCP startup. No web request or model call made.');
  }
} catch (error) { console.error('Preflight: ' + error.message); process.exitCode = 1; }
