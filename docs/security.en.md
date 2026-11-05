# Secure Defaults and P0 Verification

[中文](security.zh.md)

The default is read-only public HTTP access. Permission changes come from the owner's server environment, not tool arguments.

| Environment variable | Default | Permission |
| --- | --- | --- |
| `CLAUDE_NET_ALLOWED_PRIVATE_HOSTS` | Empty | Exact comma-separated hosts/IPs; no wildcards |
| `CLAUDE_NET_ALLOW_PRIVATE_NETWORK` | false | Full private-network access for trusted tasks |
| `CLAUDE_NET_ALLOW_UNSAFE_HTTP` | false | Caller-selected non-GET/HEAD methods or request bodies |
| `CLAUDE_NET_TRUST_PROXY` | false | Trust the configured proxy's DNS and forwarding behavior |
| `CLAUDE_NET_ALLOW_BROWSER` | false | Built-in browser; requires full private-network permission too |

Set `CLAUDE_NET_ALLOWED_PRIVATE_HOSTS=127.0.0.1` to authorize a required localhost service, then restart the MCP. Proxy discovery remains available, but routing through a proxy requires explicit trust. Prefer an existing Playwright MCP for browser work.

HTTP accepts only HTTP(S) URLs without embedded credentials. All DNS answers are checked; direct requests connect to validated addresses. Every redirect is revalidated, with a five-hop limit. Cross-origin redirects strip caller headers and explicit cookies; write requests do not follow redirects. Node passes the canonicalized URL to curl to avoid parser disagreement. Configured provider POST calls remain usable but obey network validation. Trusted proxies and explicitly allowed private hosts are outside the public-network isolation guarantee. A GET endpoint can itself have side effects.

The browser requires explicit full-network consent: checking its initial URL cannot isolate scripts, subresources, redirects or click navigation. This tool does not claim to sandbox browser networking.

## Credentials

POSIX directories use 0700 and files 0600. Windows ACLs grant only the current user and SYSTEM, without inherited rules. Existing files are tightened too; linked and multi-hardlink files are rejected. Permission failures fail closed. Long session names receive hashed jar names instead of colliding after truncation. Older long-name jars are not automatically migrated; reauthentication may be necessary.

Cookies and session data remain plaintext locally. This does not protect against malicious programs running as the same user or administrators.

## Lifecycle and Verification

The default local CLI watches its MCP owner. `npm run test:browser-lifecycle` records real browser/daemon PIDs, kills the test MCP, and checks both disappear, separately for Node and Python. It also loads a script from a Unicode/space-containing path. Custom CLIs are not instrumented; system crashes and unresponsive browser services remain limitations.

On Windows, `powershell.exe -NoProfile -File scripts/diagnose-windows.ps1` reports visible-window owners, classes and positions without closing windows. It includes titles; inspect before sharing. The historical blank window has not been reproduced, so successful cleanup is not proof of that symptom's root cause.

```powershell
npm test
npm run test:browser-live
npm run test:browser-lifecycle
```

P0 tests exercise private-address denial, alternate IP forms, unsafe redirects, cross-origin credentials, implicit POST, credential permissions, session isolation and legitimate reads. `.github/workflows/p0.yml` runs Windows/Linux/macOS verification. A workflow file alone is not evidence of successful execution; check the run for the exact commit.
