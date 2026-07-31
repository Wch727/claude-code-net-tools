# Claude Code 内置搜索策略

联网策略已写进 MCP 初始化说明和三个主工具的描述，连接后自动提供给 Claude Code，不需要复制到 `CLAUDE.md`、自定义指令或首条消息。

## 文件

- `claude-code-search.zh.md`：中文策略参考。
- `claude-code-search.en.md`：英文策略参考。
- `README.zh.md`：中文说明。
- `README.en.md`：英文说明。

## 自动生效

1. 安装并启用 MCP server。默认服务名是 `net-tools`。
2. 重启、reload，或开启新会话，使 Claude Code 重新连接 MCP。
3. MCP 初始化时自动发送总策略；`web_search`、`read_url`、`browser_interact` 加载时自动发送各自规则。

中英文策略文件只是便于阅读的说明副本。实际生效内容位于 Node 和 Python server 的 `MCP_INSTRUCTIONS` 与工具 `description`，两个版本保持一致。
