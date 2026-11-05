import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveURL, authorizeTool, isPublicAddress } from '../network-policy.mjs';
import { privateFile } from '../private-storage.mjs';
import { runProcess } from '../runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'net-p0-'));
const flags = ['CLAUDE_NET_ALLOW_PRIVATE_NETWORK', 'CLAUDE_NET_ALLOWED_PRIVATE_HOSTS', 'CLAUDE_NET_ALLOW_UNSAFE_HTTP', 'CLAUDE_NET_ALLOW_BROWSER', 'CLAUDE_NET_TRUST_PROXY'];
for (const flag of flags) delete process.env[flag];
assert.equal(isPublicAddress('::ffff:127.0.0.1'), false);
for (const url of ['http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'http://169.254.169.254/', 'http://10.0.0.1/', 'file:///etc/passwd', 'http://user:pass@example.com/']) await assert.rejects(resolveURL(url));
await assert.rejects(resolveURL('http://public.test/', async () => [{ address: '127.0.0.1' }]));
await assert.rejects(resolveURL('http://public.test/', async () => [{ address: '93.184.216.34' }, { address: '::ffff:10.0.0.1' }]));
const canonical = await resolveURL('http://93.184.216.34\\@127.0.0.1:9/');
assert.equal(canonical.url.hostname, '93.184.216.34');
assert.ok(!canonical.url.href.includes('\\'), 'the sink must use canonical URL syntax');
assert.throws(() => authorizeTool('fetch_url', { body: 'implicit-post' }), /write operations/);
let hits = 0;
const server = http.createServer((req, res) => {
  hits++;
  if (req.url === '/private') { res.writeHead(302, { Location: `http://127.0.0.2:${server.address().port}/secret` }); res.end(); }
  else if (req.url === '/scheme') { res.writeHead(302, { Location: 'file:///etc/passwd' }); res.end(); }
  else if (req.url === '/cross') { res.writeHead(302, { Location: `http://localhost:${server.address().port}/echo` }); res.end(); }
  else if (req.url === '/same') { res.writeHead(302, { Location: '/echo' }); res.end(); }
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ message: 'fixture', auth: req.headers.authorization || '', method: req.method })); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
class Client {
  constructor(command, args, env) {
    this.pending = new Map(); this.id = 0;
    this.child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.exit = once(this.child, 'exit'); this.exit.catch(() => {});
    const fail = () => { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('MCP exited')); } this.pending.clear(); };
    this.child.on('error', fail); this.child.on('exit', fail); this.child.stdin.on('error', fail); this.child.stderr.resume();
    let buffer = '';
    this.child.stdout.on('data', data => {
      buffer += data;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'); const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const result = JSON.parse(line); const item = this.pending.get(result.id);
        if (item) { clearTimeout(item.timer); this.pending.delete(result.id); item.resolve(result.result); }
      }
    });
  }
  call(name, args) { return new Promise((resolve, reject) => {
    const id = ++this.id; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('P0 call timed out: ' + name)); }, 45000);
    this.pending.set(id, { resolve, reject, timer });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
  }); }
  async close() {
    this.child.stdin.end();
    let timer;
    try { await Promise.race([this.exit, new Promise(resolve => { timer = setTimeout(() => { this.child.kill(); resolve(); }, 10000); })]); }
    finally { clearTimeout(timer); }
  }
}
const runtimes = [['node', process.execPath, ['claude_net_mcp.mjs']]];
for (const command of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  const prefix = command === 'py' ? ['-3'] : [];
  const result = spawnSync(command, [...prefix, '--version'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  if (!result.error && result.status === 0) { runtimes.push(['python', command, [...prefix, 'claude_net_mcp.py']]); break; }
}
assert.equal(runtimes.length, 2, 'P0 requires both runtimes');
try {
  const file = await privateFile(path.join(tmp, 'private'), 'owner.txt', true);
  await fs.writeFile(file, 'unchanged');
  await fs.link(file, path.join(tmp, 'hardlink'));
  await assert.rejects(privateFile(path.dirname(file), 'owner.txt', true), /linked/);
  assert.equal(await fs.readFile(file, 'utf8'), 'unchanged');
  for (const [label, command, args] of runtimes) {
    const env = { ...process.env, CLAUDE_NET_PROXY: 'direct', CLAUDE_NET_BROWSER_FALLBACK: 'never', CLAUDE_NET_COOKIE_DIR: path.join(tmp, label, 'cookies'), CLAUDE_NET_SESSION_DIR: path.join(tmp, label, 'sessions') };
    for (const flag of flags) delete env[flag];
    let client = new Client(command, args, env);
    try {
      for (const url of [base, 'http://2130706433/', 'http://[::1]/', 'http://169.254.169.254/', 'file:///etc/passwd']) assert.equal((await client.call('read_url', { url, browser: 'never' })).isError, true, label + ' denied ' + url);
      for (const name of ['read_url', 'fetch_url', 'fetch_json', 'fetch_pdf']) {
        for (const input of [{ method: 'POST' }, { body: 'implicit' }]) assert.equal((await client.call(name, { url: base, ...input })).isError, true, label + ' method gate ' + name);
      }
      assert.equal((await client.call('browser_interact', { action: 'open', url: base })).isError, true);
      assert.equal(hits, 0, 'blocked requests did not touch the local server');
      const a = 'a'.repeat(72) + 'first', b = 'a'.repeat(72) + 'other';
      for (const name of [a, b]) {
        const result = await client.call('session_create', { name, cookies: { sid: 'fixture-private-cookie' } });
        assert.ok(!result.isError, JSON.stringify(result));
        assert.ok(!JSON.stringify(result).includes('fixture-private-cookie'));
      }
      const one = JSON.parse(await fs.readFile(path.join(env.CLAUDE_NET_SESSION_DIR, a + '.json'), 'utf8'));
      const two = JSON.parse(await fs.readFile(path.join(env.CLAUDE_NET_SESSION_DIR, b + '.json'), 'utf8'));
      assert.notEqual(one.cookieJar, two.cookieJar, 'long session names must not share jars');
      const sessionFile = path.join(env.CLAUDE_NET_SESSION_DIR, a + '.json');
      console.log(label + ': checking private session ACL');
      if (process.platform !== 'win32') {
        assert.equal((await fs.stat(sessionFile)).mode & 0o777, 0o600);
        assert.equal((await fs.stat(env.CLAUDE_NET_SESSION_DIR)).mode & 0o777, 0o700);
      } else {
        const acl = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; $a=[IO.File]::GetAccessControl($env:P0_FILE); @{protected=$a.AreAccessRulesProtected; rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {$_.IdentityReference.Value}); owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value} | ConvertTo-Json -Compress'], { env: { ...process.env, P0_FILE: sessionFile }, encoding: 'utf8', timeout: 10000 });
        assert.equal(acl.stderr, '', acl.stderr);
        const security = JSON.parse(acl.stdout);
        assert.equal(security.protected, true, JSON.stringify(security));
        assert.ok(security.rules.every(sid => [security.owner, 'S-1-5-18'].includes(sid)), JSON.stringify(security));
      }
    } finally { await client.close(); }
    client = new Client(command, args, { ...env, CLAUDE_NET_ALLOWED_PRIVATE_HOSTS: '127.0.0.1,localhost' });
    console.log(label + ': checking safe and blocked redirects');
    try {
      for (const route of ['/private', '/scheme']) assert.equal((await client.call('fetch_json', { url: base + route })).isError, true, label + ' unsafe redirect');
      const same = await client.call('fetch_json', { url: base + '/same' });
      assert.ok(!same.isError, JSON.stringify(same));
      const cross = await client.call('fetch_json', { url: base + '/cross', headers: { Authorization: 'Bearer do-not-forward' } });
      assert.ok(!cross.isError, JSON.stringify(cross));
      assert.ok(!JSON.stringify(cross).includes('do-not-forward'), 'cross-origin redirect leaked Authorization');
    } finally { await client.close(); }
    hits = 0;
    console.log(label + ': P0 default gates, redirects, credential permissions and session isolation passed');
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(tmp, { recursive: true, force: true }); }
