import { appendFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const action = args[1];
const session = args[0];
const log = process.env.CLAUDE_NET_TEST_LOG;
appendFileSync(log, JSON.stringify({ args, action, session, pid: process.pid }) + "\n");
const entries = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
const count = entries.filter(row => row.session === session && row.action === action).length;
if (action === "close" && count === 1 && /retry|partial/.test(session)) {
  // Exit zero with an error envelope: the caller must still retain ownership.
  console.log(JSON.stringify({ error: "Cookie: close-secret; Authorization: Bearer fixture-secret" }));
} else if (action === "open" && session.includes("partial")) {
  console.error("Authorization: Bearer fixture-secret; body=payload-secret");
  process.exitCode = 1;
} else if (action === "open" && session.includes("hang")) {
  setInterval(() => {}, 1000);
} else if (action === "run-code") {
  console.log(JSON.stringify({ result: JSON.stringify({ url: "https://example.test/", title: "Fixture", text: "ok", elements: [] }) }));
} else {
  console.log(JSON.stringify({ result: "ok" }));
}
