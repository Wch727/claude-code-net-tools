"""Owner-configured network permissions and connection-time address validation."""
import http.client
import ipaddress
import os
import socket
import tempfile
import json
import time
import urllib.parse
import urllib.request


def enabled(name):
    return os.environ.get(name, "").lower() in {"1", "true", "yes", "on"}


def parse_url(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
        raise ValueError("Only HTTP(S) URLs without embedded credentials are allowed")
    return url


def private_host_allowed(host):
    return enabled("CLAUDE_NET_ALLOW_PRIVATE_NETWORK") or host.lower() in {item.strip().lower() for item in os.environ.get("CLAUDE_NET_ALLOWED_PRIVATE_HOSTS", "").split(",") if item.strip()}


def public_addresses(host, port):
    if host.lower().rstrip('.') == "localhost" or host.lower().rstrip('.').endswith((".localhost", ".local")):
        raise ValueError("Private network access is disabled")
    rows = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    for row in rows:
        address = ipaddress.ip_address(row[4][0])
        if address.version == 6 and (address.sixtofour or address.teredo or address in ipaddress.ip_network('64:ff9b::/96') or address in ipaddress.ip_network('64:ff9b:1::/48')):
            raise ValueError("IPv6 transition addresses are blocked")
        if address.version == 6 and address.ipv4_mapped:
            address = address.ipv4_mapped
        if not address.is_global or address.is_multicast or address.is_unspecified:
            raise ValueError("Private or non-global network address blocked")
    if not rows:
        raise ValueError("DNS returned no usable addresses")
    return rows


def validate_url(value):
    url = parse_url(value)
    if not private_host_allowed(url.hostname):
        public_addresses(url.hostname, url.port or (443 if url.scheme == "https" else 80))
    return url


def connect_public(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    if private_host_allowed(address[0]):
        return socket.create_connection(address, timeout, source_address)
    rows = public_addresses(*address)
    last = None
    for family, kind, proto, _, target in rows:
        sock = socket.socket(family, kind, proto)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                sock.settimeout(timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(target)
            return sock
        except OSError as error:
            last = error
            sock.close()
    raise last or OSError("Connection failed")


class HTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = connect_public


class HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = connect_public


class HTTPHandler(urllib.request.HTTPHandler):
    def __init__(self, proxy_host=None):
        super().__init__()
        self.proxy_host = proxy_host
    def http_open(self, request):
        def connection(*args, **kwargs):
            value = HTTPConnection(*args, **kwargs)
            if self.proxy_host and value.host == self.proxy_host:
                value._create_connection = socket.create_connection
            return value
        return self.do_open(connection, request)


class HTTPSHandler(urllib.request.HTTPSHandler):
    def __init__(self, proxy_host=None):
        super().__init__()
        self.proxy_host = proxy_host
    def https_open(self, request):
        def connection(*args, **kwargs):
            value = HTTPSConnection(*args, **kwargs)
            if self.proxy_host and value.host == self.proxy_host:
                value._create_connection = socket.create_connection
            return value
        return self.do_open(connection, request, context=self._context)


class RedirectHandler(urllib.request.HTTPRedirectHandler):
    max_redirections = 5
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if request.get_method() not in {"GET", "HEAD"}:
            raise ValueError("Redirects for HTTP writes are blocked; use the final URL explicitly")
        target = validate_url(newurl)
        result = super().redirect_request(request, fp, code, msg, headers, newurl)
        original = parse_url(request.full_url)
        if result and (target.scheme, target.netloc) != (original.scheme, original.netloc):
            result.headers.clear()
            result.unredirected_hdrs.clear()
        return result


def authorize_tool(name, args):
    if not enabled("CLAUDE_NET_ALLOW_UNSAFE_HTTP") and (args.get("body") is not None or str(args.get("method") or "GET").upper() not in {"GET", "HEAD"}):
        raise ValueError("HTTP write operations require CLAUDE_NET_ALLOW_UNSAFE_HTTP=true in the server environment")
    if name.startswith("browser_") and name != "browser_status" and not enabled("CLAUDE_NET_ALLOW_BROWSER"):
        raise ValueError("Browser operations require CLAUDE_NET_ALLOW_BROWSER=true; prefer the existing Playwright MCP")


def curl_text(command, url, timeout, proxy, user_agent, runner, creationflags):
    if proxy and not enabled("CLAUDE_NET_TRUST_PROXY"):
        raise ValueError("Proxy routing requires CLAUDE_NET_TRUST_PROXY=true")
    deadline = time.monotonic() + timeout
    with tempfile.TemporaryDirectory(prefix="net-http-") as directory:
        header_file = os.path.join(directory, "headers")
        for hop in range(6):
            target = validate_url(url)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("time budget exhausted")
            config = ["silent", "show-error", "max-filesize = 1200000", 'proto = "=http,https"',
                      "max-time = " + str(remaining), "user-agent = " + json.dumps(user_agent),
                      "url = " + json.dumps(url), "dump-header = " + json.dumps(header_file),
                      'write-out = "\\n__SEARCH_STATUS__%{http_code}"']
            config.append("proxy = " + json.dumps(proxy) if proxy else 'noproxy = "*"')
            try:
                literal = ipaddress.ip_address(target.hostname)
            except ValueError:
                literal = None
            if not proxy and not private_host_allowed(target.hostname) and literal is None:
                address = public_addresses(target.hostname, target.port or (443 if target.scheme == "https" else 80))[0][4][0]
                if ':' in address:
                    address = '[' + address + ']'
                config.append("resolve = " + json.dumps(f"{target.hostname}:{target.port or (443 if target.scheme == 'https' else 80)}:{address}"))
            fd = os.open(header_file, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
            os.close(fd)
            response = runner([command, "-q", "--config", "-"], input=("\n".join(config) + "\n").encode(),
                              capture_output=True, timeout=remaining, check=True, creationflags=creationflags)
            content, marker, raw_status = response.stdout.rpartition(b"\n__SEARCH_STATUS__")
            if not marker or not raw_status.strip().isdigit():
                raise ValueError("Invalid search HTTP response metadata")
            status = int(raw_status)
            with open(header_file, encoding="latin-1") as handle:
                headers = handle.read().strip().split("\n\n")[-1]
            location = next((line.split(":", 1)[1].strip() for line in headers.splitlines() if line.lower().startswith("location:")), None)
            if status in {301, 302, 303, 307, 308} and location:
                if hop == 5:
                    raise ValueError("Too many HTTP redirects")
                url = urllib.parse.urljoin(url, location)
                continue
            if status >= 400:
                raise RuntimeError("Search HTTP " + str(status))
            return content
