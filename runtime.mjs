import { AsyncLocalStorage } from "node:async_hooks";
import { execFile } from "node:child_process";
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isIP } from 'node:net';
import { enabled, resolveURL } from './network-policy.mjs';

export const operation = new AsyncLocalStorage();
const secrets = new Set();
const sensitive = /authorization|cookie|password|passwd|secret|token|api[_-]?key/i;

export function remember(value, key = "") {
  if (value && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) remember(item, sensitive.test(key) ? key : name);
  } else if (typeof value === "string") {
    if (sensitive.test(key) && value) {
      secrets.add(value);
      for (const part of value.split(/[;=\s]+/)) if (part.length > 3) secrets.add(part);
    }
    try {
      const url = new URL(value);
      if (url.password) secrets.add(decodeURIComponent(url.password));
      if (url.username) secrets.add(decodeURIComponent(url.username));
      for (const [name, item] of url.searchParams) if (sensitive.test(name) && item) secrets.add(item);
    } catch {}
  }
}
remember(process.env);

export function redact(value) {
  let text = String(value ?? "");
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join("[REDACTED]");
    text = text.split(encodeURIComponent(secret)).join("[REDACTED]");
  }
  return text.replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:[^&=]*(?:token|secret|password|api[_-]?key)[^&=]*)=)[^&#\s]+/gi, "$1[REDACTED]");
}

export function sanitize(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}

export function checkOperation() {
  const context = operation.getStore();
  if (context?.signal.aborted) throw new Error("Request cancelled");
  if (performance.now() >= (context?.deadline ?? Infinity)) throw new Error("time budget exhausted");
}

// Only kill the child we spawned. Browser daemons are closed by owned session name.
export async function runProcess(command, args, options = {}) {
  checkOperation();
  const context = operation.getStore();
  const timeout = Math.max(1, Math.ceil(Math.min(options.timeout || 120000, (context?.deadline ?? Infinity) - performance.now())));
  const { input, ...rest } = options;
  return new Promise((resolve, reject) => {
    let stopped = false;
    const child = execFile(command, args, { ...rest, timeout: 0, windowsHide: true }, (error, stdout, stderr) => {
      clearTimeout(timer);
      context?.signal.removeEventListener("abort", stop);
      if (error || stopped) reject(new Error(stopped ? (context?.signal.aborted ? "Request cancelled" : "time budget exhausted") : `Subprocess failed (${error.code || error.signal || "unknown"})`));
      else resolve({ stdout, stderr });
    });
    const stop = () => { stopped = true; child.kill("SIGKILL"); };
    const timer = setTimeout(stop, timeout);
    context?.signal.addEventListener("abort", stop, { once: true });
    if (context?.signal.aborted) stop();
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// curl's stdin config keeps URLs, credentials, headers and payloads out of argv.
export function curlConfig(args) {
  const aliases = { "-L": "location", "-A": "user-agent", "-w": "write-out", "-H": "header", "-X": "request" };
  const flags = new Set(["location", "silent", "show-error", "head"]);
  const quote = value => '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\v/g, "\\v") + '"';
  const lines = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) { remember(arg); lines.push("url = " + quote(arg)); continue; }
    const name = aliases[arg] || arg.replace(/^--/, "");
    if (flags.has(name)) lines.push(name);
    else {
      const value = args[++i];
      remember(value, ["header", "proxy", "data-raw", "cookie"].includes(name) ? "secret" : name);
      lines.push(name + " = " + quote(value));
    }
  }
  return lines.join("\n") + "\n";
}

export async function runCurl(command, args, options) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'net-http-'));
  const headerFile = path.join(directory, 'headers');
  await fs.writeFile(headerFile, '', { mode: 0o600 });
  const deadline = performance.now() + (options.timeout || 120000);
  let current = [...args];
  try {
    for (let hop = 0; hop <= 5; hop++) {
      checkOperation();
      const index = current.length - 1;
      const { url, addresses } = await resolveURL(current[index]);
      current[index] = url.href;
      const proxy = current.indexOf('--proxy');
      if (proxy >= 0 && !enabled('CLAUDE_NET_TRUST_PROXY')) throw new Error('Proxy routing requires CLAUDE_NET_TRUST_PROXY=true; the proxy is a trusted network boundary');
      const safe = current.filter(value => value !== '-L');
      safe.splice(safe.length - 1, 0, '--proto', '=http,https', '--dump-header', headerFile);
      if (proxy < 0 && addresses.length && !isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
        const address = addresses[0].includes(':') ? '[' + addresses[0] + ']' : addresses[0];
        safe.splice(safe.length - 1, 0, '--resolve', `${url.hostname.replace(/^\[|\]$/g, '')}:${url.port || (url.protocol === 'https:' ? 443 : 80)}:${address}`);
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('time budget exhausted');
      const output = await runProcess(command, ['-q', '--config', '-'], { ...options, timeout: remaining, input: curlConfig(safe) });
      const headers = await fs.readFile(headerFile, 'utf8');
      const blocks = headers.trim().split(/\r?\n\r?\n/);
      const final = blocks[blocks.length - 1] || '';
      const status = Number(/^HTTP\/\S+\s+(\d+)/i.exec(final)?.[1]);
      const location = /^location:\s*(.+)$/im.exec(final)?.[1]?.trim();
      if (![301, 302, 303, 307, 308].includes(status) || !location) return output;
      if (hop === 5) throw new Error('Too many HTTP redirects');
      const next = new URL(location, url);
      const write = current.includes('--data-raw') || (current.includes('-X') && !['GET', 'HEAD'].includes(current[current.indexOf('-X') + 1]));
      if (write) throw new Error('Redirects for HTTP writes are blocked; use the final URL explicitly');
      if (next.origin !== url.origin) {
        current = current.filter((value, i) => {
          if (value === '-H' || current[i - 1] === '-H' || value === '--cookie' || current[i - 1] === '--cookie') return false;
          return true;
        });
      }
      current[current.length - 1] = next.href;
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
