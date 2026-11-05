import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../runtime.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'net-browser-p0-'));
const unicodeDir = path.join(tmp, '\u4e2d\u6587 path'); await fs.mkdir(unicodeDir);
const hook = path.join(unicodeDir, 'audit.cjs'); await fs.copyFile(path.join(root, 'tests/browser-audit.cjs'), hook);
const server = http.createServer((req, res) => { res.end('<html><title>Owned browser</title><h1>Lifecycle fixture</h1></html>'); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const runtimes = [['node', process.execPath, ['claude_net_mcp.mjs']]];
for (const command of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  const prefix = command === 'py' ? ['-3'] : [];
  const probe = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true });
  if (!probe.error && probe.status === 0) { runtimes.push(['python', probe.stdout.trim(), ['claude_net_mcp.py']]); break; }
}
assert.equal(runtimes.length, 2);
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
try {
  for (const [label, command, args] of runtimes) {
    const audit = path.join(tmp, label + '.jsonl');
    const env = { ...process.env, CLAUDE_NET_PROXY: 'direct', CLAUDE_NET_ALLOW_BROWSER: 'true', CLAUDE_NET_ALLOW_PRIVATE_NETWORK: 'true', CLAUDE_NET_BROWSER_HEADED: 'false',
      CLAUDE_NET_BROWSER_WORK_DIR: path.join(tmp, label), NET_P0_AUDIT: audit, NODE_OPTIONS: '--require ' + JSON.stringify(hook) };
    delete env.CLAUDE_NET_PLAYWRIGHT_COMMAND; delete env.CLAUDE_NET_PLAYWRIGHT_ARGS;
    const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.resume(); child.stdin.on('error', () => {});
    let buffer = ''; let resolve, reject;
    const response = new Promise((a, b) => { resolve = a; reject = b; });
    child.once('error', reject);
    child.stdout.on('data', data => {
      buffer += data;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'); const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (message.id === 1) resolve(message.result);
      }
    });
    let timer;
    try {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browser_interact', arguments: { action: 'open', session: 'orphan', url: `http://127.0.0.1:${server.address().port}/` } } }) + '\n');
      const result = await Promise.race([response, new Promise((_, no) => { timer = setTimeout(() => no(new Error('Browser startup timed out')), 60000); })]);
      clearTimeout(timer);
      assert.ok(!result.isError, JSON.stringify(result));
      const entries = (await fs.readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.ok(entries.some(row => row.role === 'browser' && alive(row.pid)), 'real browser PID required');
      assert.ok(entries.some(row => row.role === 'daemon' && alive(row.pid)), 'real daemon PID required');
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      const deadline = Date.now() + 30000;
      while (entries.some(row => alive(row.pid)) && Date.now() < deadline) await new Promise(done => setTimeout(done, 200));
      assert.deepEqual(entries.filter(row => alive(row.pid)), [], 'owned real browser/daemon survived owner death');
      console.log(label + ': abrupt MCP exit reaped real daemon and browser; Unicode NODE_OPTIONS loaded');
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
      // Address only this test's exact session if an assertion failed.
      try { await runProcess(process.execPath, [path.join(root, 'node_modules/@playwright/cli/playwright-cli.js'), '-s=claude-net-tools-' + child.pid + '-orphan', 'close', '--json'], { cwd: env.CLAUDE_NET_BROWSER_WORK_DIR, timeout: 10000 }); } catch {}
    }
  }
} finally { server.closeAllConnections(); await new Promise(done => server.close(done)); await fs.rm(tmp, { recursive: true, force: true }); }
