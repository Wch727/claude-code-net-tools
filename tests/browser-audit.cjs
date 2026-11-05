const fs = require('node:fs');
const childProcess = require('node:child_process');
if (/cliDaemon\.js$/.test(process.argv[1] || '') && process.env.NET_P0_AUDIT) {
  const log = value => fs.appendFileSync(process.env.NET_P0_AUDIT, JSON.stringify(value) + '\n');
  log({ role: 'daemon', pid: process.pid });
  const original = childProcess.spawn;
  childProcess.spawn = function(command, args, options) {
    const child = original.call(this, command, args, options);
    if (args?.includes('--remote-debugging-pipe')) log({ role: 'browser', pid: child.pid });
    return child;
  };
}
