#!/usr/bin/env node

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const evalIndex = args.indexOf("eval");
const runCodeIndex = args.indexOf("run-code");
const sourceIndex = runCodeIndex >= 0 ? runCodeIndex : evalIndex;
let result = "ok";

if (sourceIndex >= 0) {
  let source = args[sourceIndex + 1] || "";
  const filenameArg = args.find((arg) => arg.startsWith("--filename="));
  if (runCodeIndex >= 0 && filenameArg) {
    source = readFileSync(filenameArg.slice("--filename=".length), "utf8");
  }
  const expectedPrefix = runCodeIndex >= 0 ? "async page =>" : "() =>";
  if (!source.trim().startsWith(expectedPrefix)) {
    process.stderr.write("unexpected Playwright function shape\n");
    process.exit(1);
  }
  try {
    const callback = new Function("return (" + source + ");")();
    if (typeof callback !== "function") throw new TypeError("source is not a function");
  } catch (error) {
    process.stderr.write("invalid Playwright function: " + error.message + "\n");
    process.exit(1);
  }
  if (source.includes("targetLocator") && source.includes("Interactive elements") === false) {
    result = JSON.stringify({
      url: "https://example.test/complex",
      title: "Complex Fixture",
      text: "Complex page rendered by Playwright",
      totalChars: 37,
      elements: [{ tag: "button", role: "button", text: "Load data", ariaLabel: "", label: "", name: "", placeholder: "", type: "button", href: "", disabled: false }],
    });
  } else if (source.includes("totalChars") && source.includes("includeLinks")) {
    const content = "Rendered fixture body from Playwright. JavaScript content is now available.";
    result = JSON.stringify({
      finalUrl: "https://example.test/rendered",
      title: "Rendered Fixture",
      contentType: "text/html",
      content,
      totalChars: content.length,
      start: 0,
      end: content.length,
      links: [{ text: "Rendered Link", url: "https://example.test/next" }],
    });
  } else if (source.includes("rendered result(s)") || source.includes("const rows = []")) {
    result = JSON.stringify({
      pageUrl: "https://www.google.com/search?q=fixture",
      pageTitle: "fixture - Google Search",
      blocked: false,
      rows: [
        {
          title: "Principles of Neurodynamics and the Perceptron",
          url: (process.env.CLAUDE_NET_TEST_BASE_URL || "https://example.test") + "/page",
          snippet: "Frank Rosenblatt, XOR, and the 1962 book.",
        },
        {
          title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
          url: (process.env.CLAUDE_NET_TEST_BASE_URL || "https://example.test") + "/page?paper=bert",
          snippet: "The original BERT paper by Devlin and colleagues.",
        },
      ],
      bodyText: "",
    });
  } else {
    result = JSON.stringify({
      url: "https://example.com/",
      title: "Example Domain",
      text: "Example Domain rendered by Playwright",
    });
  }
}

process.stdout.write(JSON.stringify({ result }) + "\n");