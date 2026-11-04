import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const tmp = await mkdtemp(path.join(os.tmpdir(), 'net-owner-'));
const hook = fileURLToPath(new URL('../browser-owner.cjs', import.meta.url));
const log = path.join(tmp, 'closed');
let daemon, owner;
try {
  await writeFile(path.join(tmp, 'cliDaemon.js'), 'setInterval(()=>{},1000)');
  await writeFile(path.join(tmp, 'close.cjs'), 'require("fs").writeFileSync(process.env.TEST_LOG,JSON.stringify(process.argv.slice(2)))');
  owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  daemon = spawn(process.execPath, ['--require', hook, path.join(tmp, 'cliDaemon.js'), 'claude-net-tools-test-owned'], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, TEST_LOG: log, CLAUDE_NET_OWNER_PID: String(owner.pid), CLAUDE_NET_OWNER_CLI: path.join(tmp, 'close.cjs') },
  });
  await new Promise(r => setTimeout(r, 2200));
  await assert.rejects(readFile(log));
  const exited = once(owner, 'exit'); owner.kill(); await exited;
  let result;
  for (let n = 0; n < 30; n++) {
    try { result = JSON.parse(await readFile(log, 'utf8')); break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert.deepEqual(result, ['-s=claude-net-tools-test-owned', 'close', '--json']);
  console.log('Owner death triggers only its named session close; live owner is preserved.');
} finally {
  for (const child of [daemon, owner]) if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
  await rm(tmp, { recursive: true, force: true });
}
