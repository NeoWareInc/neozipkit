/**
 * Shared low-level HTTP utilities for the NeoZip Token Service account, funding,
 * and identity client modules.
 *
 * These helpers are intentionally persistence-free and product-agnostic: they
 * speak raw HTTP to the Token Service and surface **generic** errors. Higher
 * layers (CLI / MCP / Desktop) own token storage and may map authentication
 * failures (401/403) to product-specific recovery guidance.
 */

import { getTokenServiceUrl } from '../constants/servers';

/**
 * Resolve and normalize a Token Service base URL.
 *
 * Resolution follows {@link getTokenServiceUrl} (explicit URL → env → default),
 * then trailing slashes are stripped so callers can safely append `/path`.
 */
export function normalizeServerUrl(serverUrl?: string): string {
  return getTokenServiceUrl({ serverUrl }).replace(/\/+$/, '');
}

/** Parse a JSON body, returning `null` for non-JSON or malformed responses. */
export async function safeJson<T>(response: Response): Promise<T | null> {
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Return the first non-empty string value among `keys`, else `null`. */
export function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Generic authentication-failure message for 401/403 responses. Returns `null`
 * for any other status. Intentionally free of product-specific recovery
 * commands — application layers should add their own guidance.
 */
export function genericAuthErrorMessage(status: number): string | null {
  if (status !== 401 && status !== 403) return null;
  return `Token Service authentication failed (HTTP ${status}). The access token may be expired or invalid.`;
}

/**
 * Extract a human-readable error from a parsed JSON body, preferring `error`
 * then `message`. For 401/403 (when `options.status` is provided) a generic
 * auth message is returned instead.
 */
export function extractError(
  parsed: unknown,
  fallback: string,
  options?: { status?: number }
): string {
  const authHint =
    options?.status != null ? genericAuthErrorMessage(options.status) : null;
  if (authHint) return authHint;
  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    if (typeof p.error === 'string') return p.error;
    if (typeof p.message === 'string') return p.message;
  }
  return fallback;
}

/**
 * Derive an access-token expiry (epoch milliseconds) from a verify/login
 * response body. Supports both absolute `expiresAt` (seconds or ms) and
 * relative `expiresIn` (seconds). Returns `null` when neither is present.
 */
export function parseAccessTokenExpiry(
  parsed: Record<string, unknown>
): number | null {
  const expiresAt = parsed.expiresAt;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    return expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  }
  const expiresIn = parsed.expiresIn;
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return Date.now() + expiresIn * 1000;
  }
  return null;
}

function fetchCauseCode(err: unknown): string | null {
  if (err == null || typeof err !== 'object') return null;
  const cause = (err as { cause?: unknown }).cause;
  if (cause == null || typeof cause !== 'object') return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Turn a thrown `fetch` error into a friendly, actionable message. Network-level
 * failures point at the unreachable base URL; everything else is passed through.
 */
export function formatTokenServiceFetchError(baseUrl: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const causeCode = fetchCauseCode(err);
  if (
    message === 'fetch failed' ||
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'EHOSTUNREACH'
  ) {
    return `Token Service unreachable at ${baseUrl}. Is it running?`;
  }
  return `Token Service request failed (${baseUrl}): ${message}`;
}
