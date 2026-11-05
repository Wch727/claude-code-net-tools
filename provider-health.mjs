import { readFileSync } from 'node:fs';
const defaults = JSON.parse(readFileSync(new URL('./contracts/quality.json', import.meta.url))).provider_recovery;
export const FAILURE_LIMIT = Math.max(1, Math.min(Number(process.env.CLAUDE_NET_PROVIDER_FAIL_LIMIT) || defaults.failure_limit, 10));
const cooldown = Math.max(1000, Math.min(Number(process.env.CLAUDE_NET_PROVIDER_COOLDOWN_MS) || defaults.cooldown_ms, defaults.maximum_cooldown_ms));
export function ready(stats, now = Date.now()) { return !stats.probing && now >= (stats.retryAt || 0); }
export function reason(stats, now = Date.now()) {
  return 'provider cooldown or recovery probe in progress; retry in about ' + Math.max(0, Math.ceil(((stats.retryAt || now) - now) / 1000)) + 's; last failure: ' + (stats.lastError || stats.failureKind || 'unknown');
}
export function claim(stats, now = Date.now()) {
  if (!ready(stats, now)) throw new Error(reason(stats, now));
  // Only a recovering provider needs a single-flight probe; ordinary requests may run concurrently.
  if (stats.retryAt) stats.probing = true;
}
export function complete(stats, ok, error = '', now = Date.now()) {
  stats.probing = false;
  stats.failureKind = ok ? '' : /\b429\b|rate.?limit/i.test(error) ? 'rate_limit' : /\b40[13]\b/.test(error) ? 'authorization' : /timeout|timed out|deadline|budget/i.test(error) ? 'timeout' : 'network';
  if (ok) stats.retryAt = 0;
  else if (stats.failureKind === 'rate_limit' || stats.consecutiveFailures >= FAILURE_LIMIT) {
    stats.retryAt = now + Math.min(defaults.maximum_cooldown_ms, cooldown * 2 ** Math.min(8, Math.max(0, stats.consecutiveFailures - FAILURE_LIMIT)));
  }
}
