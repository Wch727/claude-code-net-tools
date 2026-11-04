// Inherited only by our local Playwright CLI and its daemon.
const { spawn } = require('node:child_process');
const owner = Number(process.env.CLAUDE_NET_OWNER_PID);
const cli = process.env.CLAUDE_NET_OWNER_CLI;
const session = process.argv[2];
if (owner > 0 && cli && /cliDaemon\.js$/.test(process.argv[1] || '') && /^claude-net-tools-/.test(session || '')) {
  let closing = false;
  const timer = setInterval(() => {
    try { process.kill(owner, 0); return; } catch (error) { if (error.code !== 'ESRCH') return; }
    if (closing) return;
    closing = true;
    const env = { ...process.env };
    delete env.CLAUDE_NET_OWNER_PID;
    const child = spawn(process.execPath, [cli, '-s=' + session, 'close', '--json'], {
      env, cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
    });
    const timeout = setTimeout(() => child.kill(), 10000);
    child.on('error', () => { clearTimeout(timeout); closing = false; });
    child.on('exit', () => { clearTimeout(timeout); closing = false; });
  }, 2000);
  timer.unref();
}
