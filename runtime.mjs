import { AsyncLocalStorage } from "node:async_hooks";
import { execFile } from "node:child_process";

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

export function runCurl(command, args, options) {
  return runProcess(command, ["-q", "--config", "-"], { ...options, input: curlConfig(args) });
}
