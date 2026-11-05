# 安全默认值与 P0 验证

[English](security.en.md)

net-tools 默认作为只读公网工具使用。权限由启动 MCP 的用户通过环境变量配置，工具参数不能临时解除这些限制。

| 环境变量 | 默认 | 用途 |
| --- | --- | --- |
| `CLAUDE_NET_ALLOWED_PRIVATE_HOSTS` | 空 | 精确主机名/IP，逗号分隔，不接受通配符；仅给必须访问的本机服务授权 |
| `CLAUDE_NET_ALLOW_PRIVATE_NETWORK` | false | 允许所有内网地址；只用于你信任的任务 |
| `CLAUDE_NET_ALLOW_UNSAFE_HTTP` | false | 允许调用者指定 POST/PUT/PATCH/DELETE 或带 body 的请求 |
| `CLAUDE_NET_TRUST_PROXY` | false | 允许通过代理路由；代理端的 DNS 和转发行为属于信任边界 |
| `CLAUDE_NET_ALLOW_BROWSER` | false | 允许内置浏览器，且必须同时启用完整内网权限；浏览器脚本具有网络和交互权限 |

访问一个明确授权的本机服务示例（更改后重启 MCP）：

```powershell
[Environment]::SetEnvironmentVariable('CLAUDE_NET_ALLOWED_PRIVATE_HOSTS', '127.0.0.1', 'User')
```

使用本机代理时，按既有代理配置增加 `CLAUDE_NET_TRUST_PROXY=true`。端口扫描功能仍保留；未经授权的代理路由会被拒绝。优先使用你已有的 Playwright MCP 处理网页交互，而不是扩大 net-tools 的默认权限。

## HTTP 边界

只接受 HTTP/HTTPS，拒绝 URL 内嵌用户名和密码。检查 DNS 所有返回地址；直接连接使用已验证地址，防止检查后再解析到内网。重定向最多五次，每一跳重新校验；跨站跳转移除调用者认证头和显式 Cookie。写请求不自动跟随重定向。Node 在校验和发给 curl 时使用同一个规范化 URL。

调用者写权限不影响已配置搜索提供商内部的 POST 调用；提供商地址来自本机配置，仍受网络校验。代理和显式授权的主机不属于公网隔离保证范围。GET 接口自身若有副作用，也不能靠 HTTP 方法限制消除。

内置浏览器需要明确的完整网络授权，因为初始 URL 校验不能隔离页面脚本、子资源、重定向或点击导航。此工具不宣称给真实浏览器提供网络沙箱。

## Cookie 与会话

POSIX 目录为 0700、文件为 0600。Windows ACL 只授予当前用户和 SYSTEM，移除继承规则；权限设置失败则拒绝继续。已有文件也会收紧权限，并拒绝链接文件和多硬链接文件。超长会话名使用独立哈希 Cookie 文件名，避免截断后共用同一个 Cookie jar。

Cookie/会话仍以明文保存在本机，不能保护你免受同一用户权限的恶意程序或管理员读取。原先超长会话名的 Cookie jar 不自动迁移，必要时重新登录。模型可请求清理自己被授权管理的会话。

## 浏览器与白框

默认本地 CLI 监测其 MCP 父进程，父进程消失后关闭自己的命名会话。`npm run test:browser-lifecycle` 使用真实浏览器记录 daemon/browser PID，强制结束测试 MCP 后检查这两个进程是否退出，分别覆盖 Node 和 Python；同时检查含中文和空格的脚本路径。自定义 CLI 不注入监测；系统崩溃、机器断电或浏览器完全无响应仍有边界。

Windows 可运行 `powershell.exe -NoProfile -File scripts/diagnose-windows.ps1`，只读列出可见窗口的 PID、类别和位置。输出包含窗口标题，分享前请检查。当前未复现历史白框，不能把进程回收测试通过等同于已确认白框根因。

## 验证命令

```powershell
npm test
npm run test:browser-live
npm run test:browser-lifecycle
```

P0 测试包含默认内网拒绝、整数/IPv6 地址、危险重定向、跨站认证剥离、隐式 POST、Cookie 权限、长会话隔离和合法读取。Linux/macOS/Windows 的 GitHub Actions 工作流位于 `.github/workflows/p0.yml`；配置工作流不等于三个平台已经验证通过，具体以对应提交的运行结果为准。
