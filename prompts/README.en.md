# Built-in Claude Code Search Policy

The web policy is embedded in the MCP initialization instructions and the three primary tool descriptions. Claude Code receives it automatically after connecting; nothing needs to be copied into `CLAUDE.md`, custom instructions, or a first message.

## Files

- `claude-code-search.zh.md`: Chinese policy reference.
- `claude-code-search.en.md`: English policy reference.
- `README.zh.md`: Chinese guide.
- `README.en.md`: English guide.

## Automatic Activation

1. Install and enable the MCP server. Its default name is `net-tools`.
2. Restart, reload, or open a new session so Claude Code reconnects to it.
3. The server sends the overall policy during initialization; `web_search`, `read_url`, and `browser_interact` send their operation rules when loaded.

The Chinese and English policy files are readable documentation mirrors. The active policy lives in `MCP_INSTRUCTIONS` and the tool `description` fields in both the Node and Python servers.
