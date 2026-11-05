import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'net-install-'));
const fresh = path.join(tmp, 'fresh checkout with spaces');
const bin = path.join(tmp, 'bin');
const log = path.join(tmp, 'claude.jsonl');
mkdirSync(fresh); mkdirSync(bin);
const tracked = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(tracked.status, 0);
for (const name of tracked.stdout.split('\0').filter(Boolean)) {
  const target = path.join(fresh, name);
  mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(root, name), target);
}
writeFileSync(path.join(bin, 'mock.mjs'), `import {appendFileSync} from 'node:fs'; const args=process.argv.slice(2); appendFileSync(process.env.INSTALL_TEST_LOG,JSON.stringify(args)+'\\n'); if(args.includes('add') && process.env.INSTALL_TEST_FAIL==='1') process.exit(7);`);
if (process.platform === 'win32') writeFileSync(path.join(bin, 'claude.cmd'), `@"${process.execPath}" "${path.join(bin, 'mock.mjs')}" %*\r\n`);
else writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${path.join(bin, 'mock.mjs').replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
const windows = process.platform === 'win32';
const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, INSTALL_TEST_LOG: log };
const events = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
function install(runtime, { force = false, dependencies = false, fail = false } = {}) {
  const args = windows ? ['-NoProfile', '-File', path.join(fresh, 'scripts/install-claude-code.ps1'), '-Runtime', runtime, '-Scope', 'user', '-ShowConsole']
    : [path.join(fresh, 'scripts/install-claude-code.sh'), '--runtime', runtime, '--scope', 'user'];
  if (force) args.push(windows ? '-Force' : '--force');
  if (dependencies) args.push(windows ? '-InstallDependencies' : '--install-dependencies');
  return spawnSync(windows ? 'pwsh' : 'bash', args, { cwd: tmp, env: { ...env, INSTALL_TEST_FAIL: fail ? '1' : '0' }, encoding: 'utf8', windowsHide: true, timeout: dependencies ? 180000 : 30000 });
}
try {
  const missing = install('node', { force: true });
  assert.notEqual(missing.status, 0, 'fresh Node install must reject missing dependencies before registration');
  assert.match(missing.stdout + missing.stderr, /npm ci|InstallDependencies|install-dependencies/);
  assert.equal(events().length, 0, 'preflight failure must not remove existing registration');
  const python = install('python');
  assert.equal(python.status, 0, python.stdout + python.stderr);
  assert.equal(events().at(-1)[1], 'add', 'Python HTTP installs without node_modules');
  assert.ok(!existsSync(path.join(fresh, 'node_modules')));
  if (process.argv.includes('--install')) {
    const installed = install('node', { dependencies: true, force: true });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  } else {
    assert.ok(existsSync(path.join(root, 'node_modules')), 'run npm ci first, or opt into --install');
    symlinkSync(path.join(root, 'node_modules'), path.join(fresh, 'node_modules'), windows ? 'junction' : 'dir');
    const installed = install('node', { force: true });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  }
  const added = events().at(-1);
  assert.equal(added[1], 'add');
  assert.ok(added.includes(path.join(fresh, 'claude_net_mcp.mjs')), 'register absolute entry, not caller cwd');
  const failed = install('node', { fail: true });
  assert.notEqual(failed.status, 0, 'registration failure must propagate');
  assert.ok(!failed.stdout.includes('Done.'), 'never claim failed registration succeeded');
  console.log('Fresh install: missing dependencies, non-destructive preflight, Python stdlib, Node startup and CLI failures passed; only a fake Claude CLI was invoked.');
} finally {
  assert.ok(path.resolve(tmp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  rmSync(tmp, { recursive: true, force: true });
}
