# Prompt Setup Guide

This directory contains optional prompts for agents that use `claude-code-net-tools`.

## Files

- `net-tools-agent-search.en.md`: English prompt for query rewriting, source selection, and tool-use discipline.

## How To Use It

1. Install and enable this MCP server first. The default server name in the prompt is `net-tools`.
2. Open your agent's system prompt, developer prompt, custom instructions, project instructions, or memory file.
3. Copy the prompt block from `net-tools-agent-search.en.md` into that instruction area.
4. If your MCP server alias is not `net-tools`, replace `net-tools` in the prompt with your actual alias.
5. Save/reload the agent session so the new instructions are active.

## Claude Code

For Claude Code, put the prompt in the instruction surface your setup uses, for example:

- project instructions such as `CLAUDE.md`, if your workflow uses one;
- a user/global memory or custom instruction area, if configured;
- the first message of a session, for quick testing.

Keep the MCP server alias consistent with your install command. For example, if you added the server with:

```powershell
claude mcp add net-tools node C:\path\to\claude-code-net-tools\claude_net_mcp.mjs
```

then the prompt can keep `net-tools`. If you used another name, update the prompt text accordingly.

## OpenClaw / Other Agents

Paste the prompt into the agent's system/developer prompt field. If the client lets you define MCP tool preferences, make sure the tool names map to this server's tools:

- `search_web`
- `search_web_focused`
- `search_status`
- `scholar_search`
- `package_search`
- `fetch_url`
- `fetch_json`
- `fetch_rss`
- `fetch_pdf`

## How To Change The Prompt

Edit `net-tools-agent-search.en.md`, then copy the updated prompt into your agent again. Most agents do not automatically reload prompt files from this repository; the file here is a source copy for humans to copy into the active agent configuration.

Recommended edits:

- Change `net-tools` to your MCP server alias.
- Add preferred sources for your field, such as official docs, arXiv, PyPI, npm, GitHub, government sites, or company docs.
- Add language preferences, for example "answer in Chinese but search English sources when they are more authoritative".
- Add cost rules if you use paid API providers, for example "try free providers first; use API providers only after search_status shows free providers failing".