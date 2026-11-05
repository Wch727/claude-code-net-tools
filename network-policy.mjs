import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const enabled = name => /^(1|true|yes|on)$/i.test(process.env[name] || '');
export const privateHostAllowed = host => enabled('CLAUDE_NET_ALLOW_PRIVATE_NETWORK') || (process.env.CLAUDE_NET_ALLOWED_PRIVATE_HOSTS || '').split(',').map(item => item.trim().toLowerCase()).includes(host.toLowerCase());
export function parseURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without embedded credentials are allowed');
  return url;
}
export function isPublicAddress(value) {
  try { return ipaddr.process(value).range() === 'unicast'; } catch { return false; }
}
export async function resolveURL(value, resolver = lookup) {
  const url = parseURL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (privateHostAllowed(host)) return { url, addresses: [] };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Private network access is disabled');
  let timer;
  const addresses = ipaddr.isValid(host) ? [{ address: host }] : await Promise.race([
    resolver(host, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS validation timed out')), 5000); }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Private or non-global network address blocked');
  return { url, addresses: addresses.map(item => item.address) };
}
export function authorizeTool(name, args) {
  if (!enabled('CLAUDE_NET_ALLOW_UNSAFE_HTTP') && (args?.body != null || !['GET', 'HEAD'].includes(String(args?.method || 'GET').toUpperCase()))) throw new Error('HTTP write operations require CLAUDE_NET_ALLOW_UNSAFE_HTTP=true in the server environment');
  if (/^browser_/.test(name) && !enabled('CLAUDE_NET_ALLOW_BROWSER') && !['browser_status'].includes(name)) throw new Error('Browser operations require CLAUDE_NET_ALLOW_BROWSER=true; prefer the existing Playwright MCP');
}
