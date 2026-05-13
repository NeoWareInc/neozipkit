/**
 * NeoZip Token Service URL(s) and resolver.
 *
 * Single source of truth for the default token service URL and named server
 * lookup. Use getTokenServiceUrl() everywhere instead of hardcoding the default.
 *
 * Resolution order for getTokenServiceUrl():
 * 1. options.serverUrl (explicit URL)
 * 2. options.serverKey → TOKEN_SERVICE_URLS[serverKey]
 * 3. process.env.TOKEN_SERVICE_URL
 * 4. DEFAULT_TOKEN_SERVICE_URL
 */

/** Default NeoZip Token Service URL when no env override is set */
export const DEFAULT_TOKEN_SERVICE_URL = 'https://testnet.token-service.neozip.io';

/**
 * Named server URLs for lookup by key (e.g. "default", "dev", "staging", "production").
 * Extend this record as more servers are added; env vars still override at runtime.
 */
export const TOKEN_SERVICE_URLS: Record<string, string> = {
  default: DEFAULT_TOKEN_SERVICE_URL,
};

export interface GetTokenServiceUrlOptions {
  /** Explicit server URL (highest precedence) */
  serverUrl?: string;
  /** Key into TOKEN_SERVICE_URLS (e.g. "default", "staging") */
  serverKey?: string;
}

/**
 * Resolve the NeoZip Token Service base URL.
 * Order: options.serverUrl → options.serverKey → TOKEN_SERVICE_URL → default.
 */
export function getTokenServiceUrl(options?: GetTokenServiceUrlOptions): string {
  if (options?.serverUrl && options.serverUrl.trim()) {
    return options.serverUrl.trim();
  }
  if (options?.serverKey && TOKEN_SERVICE_URLS[options.serverKey]) {
    return TOKEN_SERVICE_URLS[options.serverKey];
  }
  const fromEnv =
    typeof process !== 'undefined' && process.env?.TOKEN_SERVICE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_TOKEN_SERVICE_URL;
}

/**
 * Return the default server URL as a single-element array for multi-calendar use.
 * Later can return multiple URLs from TOKEN_SERVICE_URLS or env.
 */
export function getDefaultTokenServiceUrls(): string[] {
  return [getTokenServiceUrl()];
}
