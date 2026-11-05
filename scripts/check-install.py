"""Offline startup check; no pip, browser, web request or Claude invocation."""
import json
import os
from pathlib import Path
import subprocess
import sys

try:
    if sys.version_info < (3, 10):
        raise RuntimeError('Python 3.10+ is required.')
    messages = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'install-check', 'version': '1'}}},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}},
    ]
    flags = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    run = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'claude_net_mcp.py')],
                         input=''.join(json.dumps(row) + '\n' for row in messages), capture_output=True,
                         encoding='utf-8', timeout=10, env={**os.environ, 'CLAUDE_NET_TOOL_PROFILE': 'compact'}, **flags)
    if run.returncode:
        raise RuntimeError('Python MCP startup failed; run python claude_net_mcp.py to diagnose.')
    rows = {row['id']: row for row in (json.loads(line) for line in run.stdout.splitlines()) if 'id' in row}
    if not rows.get(1, {}).get('result', {}).get('serverInfo') or not any(tool['name'] == 'web_search' for tool in rows.get(2, {}).get('result', {}).get('tools', [])):
        raise RuntimeError('Python MCP initialize/tools/list check failed.')
    print('Python preflight passed: runtime and stdlib MCP startup. No pip, web request or model call made.')
except Exception as error:
    print('Preflight: ' + str(error), file=sys.stderr)
    sys.exit(1)
