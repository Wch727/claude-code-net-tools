import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { operation, runProcess, curlConfig, remember, redact } from "../runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 4000) {
  const start = Date.now();
  while (!predicate()) {
    assert.ok(Date.now() - start < timeout, label);
    await delay(25);
  }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

class Client {
  constructor(command, args, env) {
    this.label = path.basename(args.at(-1) || command);
    this.log = env.CLAUDE_NET_TEST_LOG;
    this.responses = new Map();
    this.id = 0;
    this.output = "";
    this.child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.exited = once(this.child, "exit");
    let buffer = "";
    this.child.stdout.on("data", data => {
      this.output += data;
      buffer += data;
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const message = JSON.parse(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        this.responses.set(message.id, message);
      }
    });
    this.child.stderr.on("data", data => { this.output += data; });
  }
  send(method, params = {}, id = ++this.id) {
    this.lastRequest = params.name || method;
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }) + "\n");
    return id;
  }
  async response(id, timeout = 12000) {
    await until(() => this.responses.has(id), `response ${id}: ${this.output}`, timeout);
    return this.responses.get(id);
  }
  call(name, args) { return this.response(this.send("tools/call", { name, arguments: args })); }
  async close() {
    this.child.stdin.end();
    let timer;
    try {
      await Promise.race([this.exited, new Promise((_, reject) => { timer = setTimeout(() => {
        let actions = [];
        try { actions = readFileSync(this.log, 'utf8').trim().split('\n').map(JSON.parse).slice(-4).map(({ action, session, pid }) => ({ action, session, pid })); } catch {}
        this.child.kill();
        reject(new Error(this.label + ' shutdown exceeded cleanup budget; last request=' + redact(this.lastRequest) + '; owned actions=' + JSON.stringify(actions)));
      }, 15000); })]);
    } finally { clearTimeout(timer); }
  }
}

remember({ headers: { Authorization: "Bearer fixture-secret" }, url: "http://user:proxy-secret@localhost/?api_key=query-secret" });
const diagnostic = redact("Bearer fixture-secret http://user:proxy-secret@localhost/?api_key=query-secret");
for (const value of ["fixture-secret", "proxy-secret", "query-secret"]) assert.ok(!diagnostic.includes(value));
const config = curlConfig(["-L", "-H", 'X-Test: quoted"\\value\nnext', "--data-raw", "body-secret", "http://example.test/?token=url-secret"]);
assert.ok(config.includes('header = "X-Test: quoted\\"\\\\value\\nnext"'));
assert.ok(config.includes('url = "http://example.test/?token=url-secret"'));
const ctrl = new AbortController();
const killed = operation.run({ signal: ctrl.signal, deadline: Infinity }, () => runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 60000 }));
setTimeout(() => ctrl.abort(), 100);
await assert.rejects(killed, /cancelled/);
await assert.rejects(operation.run({ signal: new AbortController().signal, deadline: performance.now() + 100 }, () => runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"])), /budget/);
const parent = { signal: new AbortController().signal, deadline: performance.now() + 5000 };
await operation.run(parent, async () => {
  const deadline = parent.deadline;
  await assert.rejects(operation.run({ ...parent, deadline: performance.now() + 100 }, () => runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'])), /budget/);
  const healthy = await runProcess(process.execPath, ['-e', 'process.stdout.write("healthy")'], { encoding: 'utf8' });
  assert.equal(healthy.stdout, 'healthy');
  assert.equal(parent.deadline, deadline);
});

const runtimes = [["node", process.execPath, ["claude_net_mcp.mjs"]]];
for (const [command, prefix] of [["py", ["-3"]], ["python3", []], ["python", []]]) {
  const result = spawnSync(command, [...prefix, "-c", "import sys;print(sys.executable)"], { encoding: "utf8", windowsHide: true });
  if (!result.error && result.status === 0) { runtimes.push(["python", command, [...prefix, "claude_net_mcp.py"]]); break; }
}
assert.equal(runtimes.length, 2, "Python is required for the safety suite");
const pythonRuntime = runtimes[1];
console.log('Checking scoped provider budgets with Python runtime');
const budgetCheck = spawnSync(pythonRuntime[1], [...pythonRuntime[2].slice(0, -1), '-u', 'tests/provider-budget.py'], { cwd: root, encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL', windowsHide: true });
assert.equal(budgetCheck.status, 0, 'Python budget fixture failed: ' + budgetCheck.stdout + budgetCheck.stderr);
assert.match(budgetCheck.stdout, /healthy fallback ran/);

const active = new Set();
let hits = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/deepseek') {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      const data = JSON.parse(raw);
      assert.equal(req.headers.authorization, 'Bearer fixture-deepseek');
      assert.equal(data.query, 'BERT');
      assert.equal(data.need_content, false);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results: [{ title: 'BERT original paper', url: 'https://example.com/bert', summary: 'DeepSeek detailed summary', snippet: 'short' }] }));
    });
    return;
  }
  hits++;
  active.add(res);
  res.on("close", () => active.delete(res));
  if (req.url.startsWith("/echo")) {
    let body = "";
    req.on("data", data => { body += data; });
    req.on("end", () => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ auth: req.headers.authorization, body })); });
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("slow ");
    const timer = setInterval(() => res.write("trickle "), 100);
    res.on("close", () => clearInterval(timer));
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const tmp = mkdtempSync(path.join(os.tmpdir(), "net-safety-"));
// A separate process must survive every cancellation and browser cleanup.
const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { windowsHide: true, stdio: "ignore" });
const unrelatedExit = once(unrelated, "exit");
try {
  for (const [name, command, args] of runtimes) {
    const log = path.join(tmp, name + ".jsonl");
    const env = { ...process.env, CLAUDE_NET_ALLOW_PRIVATE_NETWORK: 'true', CLAUDE_NET_ALLOW_UNSAFE_HTTP: 'true', CLAUDE_NET_ALLOW_BROWSER: 'true', CLAUDE_NET_PROXY: "direct", CLAUDE_NET_BROWSER_FALLBACK: "never",
      CLAUDE_NET_PLAYWRIGHT_COMMAND: process.execPath, CLAUDE_NET_PLAYWRIGHT_ARGS: JSON.stringify([path.join(root, "tests/lifecycle-mock.mjs")]),
      CLAUDE_NET_TEST_LOG: log, CLAUDE_NET_ARXIV_API_URL: base + "/slow", CLAUDE_NET_DISABLED_PROVIDERS: "",
      CLAUDE_NET_DEBUG: "1", BRAVE_SEARCH_API_KEY: "environment-secret",
      DEEPSEEK_API_KEY: 'fixture-deepseek', DEEPSEEK_SEARCH_URL: base + '/deepseek', CLAUDE_NET_SEARCH_PROVIDERS: 'deepseek' };
    const client = new Client(command, args, env);
    let primaryFailure;
    const entries = () => { try { return readFileSync(log, "utf8").trim().split("\n").map(JSON.parse); } catch { return []; } };
    try {
      const init = await client.response(client.send('initialize'));
      assert.ok(init.result.instructions.includes('Prefer native WebSearch/WebFetch'));
      assert.ok(!init.result.instructions.includes('Proactively call net-tools'));
      const searchResult = await client.call('web_search', { query: 'BERT', providers: ['deepseek'], count: 1, browser: 'never', verify_top: 0 });
      assert.ok(!searchResult.result.isError, JSON.stringify(searchResult));
      assert.ok(JSON.stringify(searchResult).includes('DeepSeek detailed summary'));
      assert.ok(JSON.stringify(searchResult).includes('https://example.com/bert'));
      const echo = await client.call("fetch_json", { url: base + "/echo", method: "POST", headers: { Authorization: "Bearer transmitted-secret" }, body: "payload-secret" });
      assert.ok(!echo.result.isError, JSON.stringify(echo));
      assert.ok(JSON.stringify(echo).includes("transmitted-secret"), "successful fetched content is preserved");
      const error = await client.call("unknown environment-secret", { url: "http://user:proxy-secret@localhost/?token=query-secret", headers: { Authorization: "Bearer fixture-secret" }, cookies: "sid=cookie-secret", body: "payload-secret" });
      assert.equal(error.result.isError, true);
      assert.ok(!JSON.stringify(error).includes("environment-secret"));

      const start = Date.now();
      const timeout = await client.call("fetch_json", { url: base + "/slow?token=query-secret", timeout: 1 });
      assert.equal(timeout.result.isError, true);
      assert.match(JSON.stringify(timeout), /time budget exhausted/, name + " deadline diagnostic must not be reported as an unavailable subprocess");
      assert.ok(Date.now() - start < 3500, name + " HTTP timeout is total, not per read");
      await until(() => active.size === 0, name + " timed out HTTP socket closed");

      const id = client.send("tools/call", { name: "fetch_json", arguments: { url: base + "/slow", timeout: 30 } });
      await until(() => active.size > 0, name + " cancellable HTTP started");
      client.send("notifications/cancelled", { requestId: id }, null);
      const ping = await client.response(client.send("ping"));
      assert.deepEqual(ping.result, {});
      await until(() => active.size === 0, name + " cancelled HTTP socket closed");
      await client.call("search_status", {});
      assert.ok(!client.responses.has(id), name + " suppress cancelled response");

      const before = hits;
      const searchStart = Date.now();
      const search = await client.call("web_search", { query: "deadline fixture", queries: ["second fixture", "third fixture"], intent: "academic", providers: ["arxiv"], time_budget: 5, verify_top: 0, browser: "never" });
      assert.ok(!search.result.isError, JSON.stringify(search));
      assert.ok(Date.now() - searchStart < 7500, name + " shared multi-query deadline");
      assert.ok(hits > before);
      await until(() => active.size === 0, name + " no HTTP workers after budget");
      const after = hits;
      await delay(250);
      assert.equal(hits, after, name + " no late fallback requests");

      await client.call("browser_interact", { action: "open", session: "retry", url: "https://example.test/" });
      const failed = await client.call("browser_interact", { action: "close", session: "retry" });
      assert.equal(failed.result.isError, true);
      for (const secret of ["fixture-secret", "close-secret"]) assert.ok(!JSON.stringify(failed).includes(secret));
      const retry = await client.call("browser_interact", { action: "close", session: "retry" });
      assert.ok(!retry.result.isError);
      assert.equal(entries().filter(row => row.session.endsWith("-retry") && row.action === "close").length, 2);
      const partial = await client.call("browser_interact", { action: "open", session: "partial", url: "https://example.test/" });
      assert.equal(partial.result.isError, true);
      assert.ok(!JSON.stringify(partial).includes("payload-secret"));
      assert.equal(entries().filter(row => row.session.endsWith("-partial") && row.action === "close").length, 1);

      const browserId = client.send("tools/call", { name: "browser_interact", arguments: { action: "open", session: "hang", url: "https://example.test/" } });
      await until(() => entries().some(row => row.session.endsWith("-hang") && row.action === "open"), name + " browser child started");
      const childPid = entries().find(row => row.session.endsWith("-hang") && row.action === "open").pid;
      client.send("notifications/cancelled", { requestId: browserId }, null);
      await until(() => !alive(childPid), name + " cancelled CLI reaped");
      await until(() => entries().some(row => row.session.endsWith("-hang") && row.action === "close"), name + " partial open cleanup despite cancellation");
      await client.call("search_status", {});
      assert.ok(!client.responses.has(browserId));
      assert.ok(alive(unrelated.pid), "unrelated process survived");
    } catch (error) { primaryFailure = error; throw error; }
    finally {
      try { await client.close(); }
      catch (error) { if (primaryFailure) throw new AggregateError([primaryFailure, error], 'Test request and cleanup both failed'); throw error; }
    }
    assert.equal(entries().filter(row => row.session.endsWith("-partial") && row.action === "close").length, 2, name + " shutdown retries retained failed close");
    assert.equal(entries().filter(row => row.session.endsWith("-retry") && row.action === "close").length, 2, name + " successful close removed registration");
    assert.ok(alive(unrelated.pid));
    console.log(name + ": cancellation, deadlines, sanitization and browser cleanup passed");
  }
} finally {
  unrelated.kill();
  await unrelatedExit;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
}
console.log("Safety regression tests passed; localhost fixtures only.");
