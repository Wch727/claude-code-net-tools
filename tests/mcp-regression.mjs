import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeServer = path.join(root, "claude_net_mcp.mjs");
const pythonServer = path.join(root, "claude_net_mcp.py");

function assertIncludes(text, needle, context = "") {
  assert.ok(String(text).includes(needle), `${context}\nExpected output to include ${JSON.stringify(needle)}\nActual output:\n${text}`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

class McpClient {
  constructor(label, command, args, env) {
    this.label = label;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.buffer = "";
    this.child = spawn(command, args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk; });
    this.child.on("exit", (code, signal) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(`${this.label} exited with code=${code} signal=${signal}\n${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  onStdout(chunk) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        throw new Error(`${this.label} emitted non-JSON line: ${line}\n${error.message}`);
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${this.label} JSON-RPC error: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
    }
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.label} timed out waiting for ${method}\n${this.stderr}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async initialize() {
    return this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "regression-test", version: "0" } });
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    return result.tools || [];
  }

  async callTool(name, args = {}) {
    const result = await this.callToolResult(name, args);
    return (result.content || []).map((item) => item.text || "").join("\n");
  }

  async callToolResult(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args });
    const text = (result.content || []).map((item) => item.text || "").join("\n");
    assert.equal(result.isError, undefined, `${this.label} ${name} returned MCP error:\n${text}`);
    return result;
  }

  close() {
    this.child.kill();
  }
}

function cleanEnv(baseUrl, runtime) {
  const env = { ...process.env };
  for (const key of [
    "KIMI_API_KEY", "MOONSHOT_API_KEY", "MINIMAX_API_KEY", "BRAVE_SEARCH_API_KEY",
    "SERPER_API_KEY", "GOOGLE_SERPER_API_KEY", "TAVILY_API_KEY",
    "CLAUDE_NET_SEARCH_PROVIDERS", "CLAUDE_NET_SCHOLAR_PROVIDERS", "CLAUDE_NET_DISABLED_PROVIDERS",
  ]) env[key] = "";
  env.CLAUDE_NET_PROXY = "direct";
  env.CLAUDE_NET_BROWSER_FALLBACK = "never";
  env.CLAUDE_NET_TOOL_PROFILE = "compact";
  env.CLAUDE_NET_PLAYWRIGHT_COMMAND = process.execPath;
  env.CLAUDE_NET_PLAYWRIGHT_ARGS = JSON.stringify([path.join(root, "tests", "playwright-cli-mock.mjs")]);
  env.CLAUDE_NET_ARXIV_API_URL = `${baseUrl}/arxiv`;
  env.CLAUDE_NET_TEST_BASE_URL = baseUrl;
  env.CLAUDE_NET_ARXIV_COOLDOWN_MS = "60000";
  env.CLAUDE_NET_COOKIE_DIR = path.join(os.tmpdir(), `claude-net-tools-test-${process.pid}-${runtime}`, "cookies");
  env.CLAUDE_NET_SESSION_DIR = path.join(os.tmpdir(), `claude-net-tools-test-${process.pid}-${runtime}`, "sessions");
  env.CLAUDE_NET_CURL = process.platform === "win32" ? "curl.exe" : "curl";
  return env;
}

function toolMap(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function propertyKeys(tool) {
  return Object.keys(tool.inputSchema?.properties || {}).sort();
}

function findPython() {
  const candidates = process.platform === "win32"
    ? [{ command: "python", args: [] }, { command: "py", args: ["-3"] }, { command: "python3", args: [] }]
    : [{ command: "python3", args: [] }, { command: "python", args: [] }];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "--version"], { encoding: "utf8", windowsHide: true });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

async function runRuntime(label, command, args, baseUrl, hitCounters) {
  const client = new McpClient(label, command, args, cleanEnv(baseUrl, label));
  try {
    const initialization = await client.initialize();
    assertIncludes(initialization.instructions, "Use only net-tools for external web access", `${label} automatic MCP instructions`);
    assertIncludes(initialization.instructions, "make one web_search call with verify_top=0", `${label} cost-aware search instructions`);
    assertIncludes(initialization.instructions, "continue using the same document_id and that offset", `${label} MCP snapshot pagination instructions`);
    assertIncludes(initialization.instructions, "built-in free defaults", `${label} free-provider instructions`);
    assertIncludes(initialization.instructions, "do not keep searching merely to reach a source quota", `${label} bounded source instructions`);
    const tools = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ["browser_interact", "read_url", "web_search"], `${label} compact tool profile`);
    const map = toolMap(tools);
    assert.deepEqual(map.get("web_search")?.inputSchema?.required, ["query"], `${label} web_search required fields`);
    assertIncludes(map.get("web_search")?.description, "rather than relying on snippets or Claude Code Fetch/WebFetch", `${label} automatic search-to-read guidance`);
    assertIncludes(map.get("web_search")?.description, "Routine tasks should use one call", `${label} automatic web_search guidance`);
    assertIncludes(map.get("read_url")?.description, "offset=next_offset", `${label} automatic read_url continuation guidance`);
    assertIncludes(map.get("web_search")?.inputSchema?.properties?.providers?.description, "paid API provider only when the user explicitly requests it", `${label} provider cost guidance`);
    assertIncludes(map.get("browser_interact")?.description, "snapshot before acting", `${label} automatic browser guidance`);
    assert.ok(map.get("read_url")?.inputSchema?.properties?.document_id, `${label} read_url document_id`);
    assert.equal(map.get("read_url")?.inputSchema?.anyOf, undefined, `${label} read_url must avoid Anthropic-rejected top-level anyOf`);
    assert.ok(map.get("read_url")?.inputSchema?.properties?.max_bytes?.default >= 20000000, `${label} read_url snapshot byte limit`);
    assert.ok(map.get("browser_interact")?.inputSchema?.properties?.action, `${label} browser_interact action`);

    const doctor = await client.callTool("net_doctor", { providers: ["duckduckgo", "kimi"], live: false });
    assertIncludes(doctor, "Claude Code net-tools doctor:", `${label} net_doctor`);
    assertIncludes(doctor, "Mode: configuration only", `${label} net_doctor`);
    assertIncludes(doctor, "Provider readiness:", `${label} net_doctor`);
    assertIncludes(doctor, "kimi: skipped paid API", `${label} net_doctor`);
    const status = await client.callTool("search_status", { providers: ["duckduckgo", "arxiv", "kimi", "not_real"] });
    assertIncludes(status, "Default scholar order:", `${label} search_status`);
    assertIncludes(status, "group=web", `${label} search_status`);
    assertIncludes(status, "group=scholar", `${label} search_status`);
    assertIncludes(status, "missing env:", `${label} search_status`);
    assertIncludes(status, "unknown provider", `${label} search_status`);
    assertIncludes(status, "include_paid=true", `${label} search_status`);

    const browserHealth = await client.callTool("browser_status", { live: true });
    assertIncludes(browserHealth, "Live check: ok", label + " browser_status");
    assertIncludes(browserHealth, "Example Domain", label + " browser_status");

    const browserResults = await client.callTool("browser_search", { query: "Rosenblatt XOR Principles of Neurodynamics 1962", count: 3 });
    assertIncludes(browserResults, "Principles of Neurodynamics", label + " browser_search");
    assertIncludes(browserResults, "Provider: browser:google", label + " browser_search");
    const compactBrowser = await client.callToolResult("browser_interact", { action: "search", query: "Rosenblatt XOR Principles of Neurodynamics 1962", count: 3 });
    assert.equal(compactBrowser.structuredContent?.action, "search", label + " browser_interact structured action");
    assert.ok(compactBrowser.structuredContent?.results?.length >= 1, label + " browser_interact structured results");

    const focusedBrowser = await client.callTool("search_web_focused", { query: "Rosenblatt XOR problem Principles of Neurodynamics 1962", count: 3, browser: "always" });
    assertIncludes(focusedBrowser, "Principles of Neurodynamics", label + " focused browser relevance");

    const rendered = await client.callTool("browser_fetch", { url: "https://example.test/app", include_links: true });
    assertIncludes(rendered, "Rendered fixture body from Playwright", label + " browser_fetch");
    assertIncludes(rendered, "https://example.test/next", label + " browser_fetch links");

    const visual = await client.callToolResult("browser_screenshot", { query: "visual fixture", count: 2, format: "png", wait_ms: 0 });
    const visualText = visual.content.find((item) => item.type === "text")?.text || "";
    const visualImage = visual.content.find((item) => item.type === "image");
    assertIncludes(visualText, "Browser visual search: visual fixture", label + " browser_screenshot text");
    assert.equal(visualImage?.mimeType, "image/png", label + " browser_screenshot MIME type");
    assert.ok((visualImage?.data || "").length > 50, label + " browser_screenshot image payload");

    const action = await client.callTool("browser_action", { action: "open", session: "fixture", url: "https://example.test/complex" });
    assertIncludes(action, "Browser action: open", label + " browser_action");
    assertIncludes(action, "Interactive elements: 1", label + " browser_action elements");
    assertIncludes(action, "Load data", label + " browser_action element label");

    const multiSearchResult = await client.callToolResult("web_search", {
      query: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      queries: ["BERT original paper Devlin"],
      intent: "academic",
      count: 2,
      browser: "always",
      verify_top: 1,
      time_budget: 15,
    });
    const multiSearch = multiSearchResult.content.map((item) => item.text || "").join("\n");
    assertIncludes(multiSearch, "BERT original paper Devlin", label + " multi-query search");
    assertIncludes(multiSearch, "\n1. BERT: Pre-training", label + " exact academic title priority");
    assertIncludes(multiSearch, "academic exact-title match", label + " exact academic title note");
    assertIncludes(multiSearch, "Verification: reachable; HTTP 200", label + " search verification");
    assertIncludes(multiSearch, "no heuristic relevance reranking", label + " search ordering");
    assert.equal(multiSearchResult.structuredContent?.intent, "academic", label + " web_search structured intent");
    assert.ok(multiSearchResult.structuredContent?.results?.length >= 1, label + " web_search structured results");

    const beforeLegacyPage = hitCounters.page;
    const page = await client.callTool("fetch_url", { url: `${baseUrl}/page`, extract: "readable", max_chars: 500, include_links: true, link_limit: 5 });
    assertIncludes(page, "Status: 200", `${label} fetch_url`);
    assertIncludes(page, "Content range: characters 0-500", `${label} fetch_url`);
    assertIncludes(page, "next_offset: 500", `${label} fetch_url`);
    assertIncludes(page, "Links", `${label} fetch_url`);
    assertIncludes(page, "Alpha", `${label} fetch_url`);
    const continued = await client.callTool("fetch_url", { url: `${baseUrl}/page`, extract: "readable", max_chars: 500, offset: 500 });
    assertIncludes(continued, "Content range: characters 500-", `${label} fetch_url offset`);
    assert.equal(hitCounters.page, beforeLegacyPage + 1, `${label} fetch_url continuation must use cache`);

    const beforeSnapshotPage = hitCounters.page;
    const firstRead = await client.callToolResult("read_url", { url: `${baseUrl}/page`, extract: "readable", max_chars: 500, refresh: true, include_links: true });
    const documentId = firstRead.structuredContent?.document_id;
    assert.ok(/^doc_[a-f0-9]{24}$/.test(documentId || ""), `${label} read_url document ID`);
    assert.equal(firstRead.structuredContent?.next_offset, 500, `${label} read_url next offset`);
    const secondRead = await client.callToolResult("read_url", { document_id: documentId, offset: 500, max_chars: 500 });
    assert.equal(secondRead.structuredContent?.snapshot, "cache", `${label} read_url continuation snapshot`);
    assert.equal(secondRead.structuredContent?.offset, 500, `${label} read_url continuation offset`);
    assert.equal(hitCounters.page, beforeSnapshotPage + 1, `${label} read_url continuation must not refetch`);

    const hugeRead = await client.callToolResult("read_url", { url: `${baseUrl}/huge-page`, extract: "readable", max_chars: 500, refresh: true });
    assert.ok(hugeRead.structuredContent?.total_chars > 1200000, `${label} read_url must snapshot HTML beyond the old byte cap`);

    const pdfHealth = await client.callTool("pdf_status", {});
    if (pdfHealth.includes("Status: available")) {
      const beforeLegacyPdf = hitCounters.pdf;
      const firstPdfPage = await client.callTool("fetch_pdf", { url: `${baseUrl}/paper.pdf`, max_chars: 500 });
      assertIncludes(firstPdfPage, "Content range: characters 0-500", `${label} fetch_pdf first page`);
      assertIncludes(firstPdfPage, "next_offset: 500", `${label} fetch_pdf next offset`);
      assertIncludes(firstPdfPage, "Long PDF fixture line", `${label} fetch_pdf extracted text`);
      const secondPdfPage = await client.callTool("fetch_pdf", { url: `${baseUrl}/paper.pdf`, max_chars: 500, offset: 500 });
      assertIncludes(secondPdfPage, "Content range: characters 500-1000", `${label} fetch_pdf continuation`);
      assert.equal(hitCounters.pdf, beforeLegacyPdf + 1, `${label} fetch_pdf continuation must use cache`);

      const beforeSnapshotPdf = hitCounters.pdf;
      const firstPdfRead = await client.callToolResult("read_url", { url: `${baseUrl}/paper.pdf`, kind: "pdf", max_chars: 500, refresh: true });
      const pdfDocumentId = firstPdfRead.structuredContent?.document_id;
      assert.equal(firstPdfRead.structuredContent?.kind, "pdf", `${label} read_url PDF kind`);
      const secondPdfRead = await client.callToolResult("read_url", { document_id: pdfDocumentId, offset: 500, max_chars: 500 });
      assert.equal(secondPdfRead.structuredContent?.snapshot, "cache", `${label} read_url PDF continuation snapshot`);
      assert.equal(hitCounters.pdf, beforeSnapshotPdf + 1, `${label} read_url PDF continuation must not refetch`);
    } else {
      console.warn(`Skipping ${label} PDF pagination smoke: pdftotext is unavailable.`);
    }

    const gbk = await client.callTool("fetch_url", { url: `${baseUrl}/gbk`, extract: "readable", max_chars: 800 });
    assertIncludes(gbk, "中文", `${label} gbk charset decode`);

    const blocked = await client.callTool("fetch_url", { url: `${baseUrl}/blocked`, extract: "readable", max_chars: 800 });
    assertIncludes(blocked, "Fetch diagnostics:", `${label} blocked diagnostics`);
    assertIncludes(blocked, "Possible anti-bot", `${label} blocked diagnostics`);

    const blockedWithBrowser = await client.callTool("fetch_url", { url: baseUrl + "/blocked", extract: "readable", max_chars: 800, browser: "auto" });
    assertIncludes(blockedWithBrowser, "Rendered fixture body from Playwright", label + " fetch browser fallback");
    assertIncludes(blockedWithBrowser, "Browser fallback reason:", label + " fetch browser fallback");
    const completeArticle = await client.callTool("fetch_url", { url: baseUrl + "/complete-article", extract: "readable", max_chars: 800, browser: "auto" });
    assertIncludes(completeArticle, "Security check is discussed as ordinary article content", label + " complete article");
    assert.ok(!completeArticle.includes("Fetch diagnostics:"), label + " complete article should not be flagged as blocked");
    assert.ok(!completeArticle.includes("Browser fallback reason:"), label + " complete article should not trigger browser fallback");
    assert.ok(!completeArticle.includes("Rendered fixture body from Playwright"), label + " complete article should keep HTTP content");

    const linksPage = await client.callTool("fetch_url", { url: `${baseUrl}/links`, extract: "readable", include_links: true, link_limit: 5 });
    assertIncludes(linksPage, "https://example.com/target", `${label} ddg relative redirect link`);

    const sessionCreated = await client.callTool("session_create", { name: "smoke", headers: { "X-Session-Test": "alpha" }, cookies: { token: "abc" }, referer: `${baseUrl}/ref` });
    assertIncludes(sessionCreated, "Session saved:", `${label} session_create`);
    assertIncludes(sessionCreated, "cookies=1 named cookie(s)", `${label} session_create`);
    const echo = await client.callTool("fetch_json", { url: `${baseUrl}/echo`, session: "smoke" });
    assertIncludes(echo, '"x-session-test": "alpha"', `${label} session header`);
    assertIncludes(echo, '"cookie": "token=abc"', `${label} session cookie`);
    assertIncludes(echo, `"referer": "${baseUrl}/ref"`, `${label} session referer`);
    const sessionAfterFetch = await client.callTool("session_status", { name: "smoke" });
    assertIncludes(sessionAfterFetch, `referer=${baseUrl}/echo`, `${label} session referer update`);
    const cleared = await client.callTool("session_clear", { name: "smoke" });
    assertIncludes(cleared, "Cleared session: smoke", `${label} session_clear`);

    const before = hitCounters.arxiv;
    const arxivFirst = await client.callTool("scholar_search", { query: "BERT", providers: ["arxiv"], count: 1 });
    assertIncludes(arxivFirst, "HTTP 429", `${label} arxiv first`);
    assert.equal(hitCounters.arxiv, before + 1, `${label} should call arXiv fixture once`);

    const arxivSecond = await client.callTool("scholar_search", { query: "BERT", providers: ["arxiv"], count: 1 });
    assertIncludes(arxivSecond, "recently returned HTTP 429", `${label} arxiv cooldown`);
    assert.equal(hitCounters.arxiv, before + 1, `${label} should not call arXiv fixture while cooling down`);

    const cooldownStatus = await client.callTool("search_status", { providers: ["arxiv"] });
    assertIncludes(cooldownStatus, "cooldown", `${label} cooldown status`);

    return tools;
  } finally {
    client.close();
  }
}

async function assertFullProfile(label, command, args, baseUrl) {
  const env = cleanEnv(baseUrl, label + "-full");
  env.CLAUDE_NET_TOOL_PROFILE = "full";
  const client = new McpClient(label + "-full", command, args, env);
  try {
    await client.initialize();
    const names = (await client.listTools()).map((tool) => tool.name);
    for (const required of ["web_search", "read_url", "browser_interact", "search_web", "search_web_focused", "fetch_url", "fetch_pdf", "browser_fetch", "browser_action", "session_create", "net_doctor"]) {
      assert.ok(names.includes(required), `${label} full profile missing ${required}`);
    }
  } finally {
    client.close();
  }
}
function buildPdf(lines) {
  const escapePdfText = (value) => value.replace(/([\\()])/g, "\\$1");
  const content = [
    "BT",
    "/F1 9 Tf",
    "10 TL",
    "72 760 Td",
    ...lines.flatMap((line, index) => index === 0 ? [`(${escapePdfText(line)}) Tj`] : ["T*", `(${escapePdfText(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const longText = Array.from({ length: 90 }, (_, index) => `Long fixture paragraph ${index} keeps enough readable text for pagination.`).join(" ");
const longPdf = buildPdf(Array.from({ length: 70 }, (_, index) => `Long PDF fixture line ${String(index).padStart(3, "0")}: pagination keeps reading beyond the first chunk.`));
const hugeText = "Large document snapshot content. ".repeat(50000);
const hitCounters = { page: 0, pdf: 0, huge: 0, arxiv: 0 };
const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/page") {
    hitCounters.page += 1;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><title>Fixture</title></head><body><article><h1>Fixture Page</h1><p>${longText}</p><a href="/alpha">Alpha</a><a href="/beta">Beta</a><a href="https://example.org/out">External</a></article></body></html>`);
    return;
  }
  if (url.pathname === "/huge-page") {
    hitCounters.huge += 1;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><title>Huge Fixture</title></head><body><article><h1>Huge Fixture</h1><p>${hugeText}</p></article></body></html>`);
    return;
  }
  if (url.pathname === "/paper.pdf") {
    hitCounters.pdf += 1;
    res.writeHead(200, { "content-type": "application/pdf", "content-length": longPdf.length });
    res.end(longPdf);
    return;
  }
  if (url.pathname === "/gbk") {
    res.writeHead(200, { "content-type": "text/html; charset=gb2312" });
    res.end(Buffer.concat([
      Buffer.from("<!doctype html><html><head><title>GBK</title></head><body><article><h1>GBK</h1><p>", "ascii"),
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
      Buffer.from("</p></article></body></html>", "ascii"),
    ]));
    return;
  }
  if (url.pathname === "/blocked") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><head><title>Just a moment...</title><script>window.__cf=true</script></head><body>Checking if the site connection is secure. Enable JavaScript and cookies to continue. Cloudflare captcha security check.</body></html>");
    return;
  }
  if (url.pathname === "/complete-article") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><head><title>Complete Article</title></head><body><article><h1>Complete Article</h1><p>Security check is discussed as ordinary article content. " + longText + "</p></article></body></html>");
    return;
  }
  if (url.pathname === "/links") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html><body><main><p>Links fixture</p><a href="/l/?uddg=https%3A%2F%2Fexample.com%2Ftarget">Target</a></main></body></html>');
    return;
  }  if (url.pathname === "/echo") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      "x-session-test": req.headers["x-session-test"] || "",
      cookie: req.headers.cookie || "",
      referer: req.headers.referer || "",
    }));
    return;
  }
  if (url.pathname === "/arxiv") {
    hitCounters.arxiv += 1;
    res.writeHead(429, { "content-type": "text/plain; charset=utf-8" });
    res.end("Rate Exceeded");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;
try {
  const nodeTools = await runRuntime("node", process.execPath, [nodeServer], baseUrl, hitCounters);
  await assertFullProfile("node", process.execPath, [nodeServer], baseUrl);
  const python = findPython();
  if (python) {
    const pythonTools = await runRuntime("python", python.command, [...python.args, pythonServer], baseUrl, hitCounters);
    await assertFullProfile("python", python.command, [...python.args, pythonServer], baseUrl);
    const nodeMap = toolMap(nodeTools);
    const pythonMap = toolMap(pythonTools);
    assert.deepEqual([...nodeMap.keys()].sort(), [...pythonMap.keys()].sort(), "Node/Python tool names diverged");
    for (const name of nodeMap.keys()) {
      assert.equal(nodeMap.get(name)?.description, pythonMap.get(name)?.description, `Node/Python descriptions diverged for ${name}`);
      assert.deepEqual(propertyKeys(nodeMap.get(name)), propertyKeys(pythonMap.get(name)), `Node/Python schema properties diverged for ${name}`);
    }
  } else {
    console.warn("Skipping Python MCP runtime smoke: Node child_process could not spawn a Python 3 interpreter in this environment.");
  }
  console.log("MCP regression tests passed for Node and Python builds.");
} finally {
  server.close();
}
