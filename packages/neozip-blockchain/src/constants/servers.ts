/**
 * Centralized Zipstamp server URL(s) and resolver.
 *
 * Single source of truth for the default stamp server URL and named server
 * lookup. Env vars ZIPSTAMP_SERVER_URL and TOKEN_SERVER_URL override the
 * default when set. Use getZipStampServerUrl() everywhere instead of
 * hardcoding the default.
 *
 * Resolution order for getZipStampServerUrl():
 * 1. options.serverUrl (explicit URL)
 * 2. options.serverKey → ZIPSTAMP_SERVER_URLS[serverKey]
 * 3. process.env.ZIPSTAMP_SERVER_URL, then process.env.TOKEN_SERVER_URL
 * 4. DEFAULT_ZIPSTAMP_SERVER_URL
 */

/** Default Zipstamp server URL when no env override is set */
export const DEFAULT_ZIPSTAMP_SERVER_URL = 'https://zipstamp-dev.neozip.io';

/**
 * Named server URLs for lookup by key (e.g. "default", "dev", "staging", "production").
 * Extend this record as more servers are added; env vars still override at runtime.
 */
export const ZIPSTAMP_SERVER_URLS: Record<string, string> = {
  default: DEFAULT_ZIPSTAMP_SERVER_URL,
};

export interface GetZipStampServerUrlOptions {
  /** Explicit server URL (highest precedence) */
  serverUrl?: string;
  /** Key into ZIPSTAMP_SERVER_URLS (e.g. "default", "staging") */
  serverKey?: string;
}

/**
 * Resolve the Zipstamp server URL.
 * Order: options.serverUrl → options.serverKey → ZIPSTAMP_SERVER_URL → TOKEN_SERVER_URL → default.
 */
export function getZipStampServerUrl(options?: GetZipStampServerUrlOptions): string {
  if (options?.serverUrl && options.serverUrl.trim()) {
    return options.serverUrl.trim();
  }
  if (options?.serverKey && ZIPSTAMP_SERVER_URLS[options.serverKey]) {
    return ZIPSTAMP_SERVER_URLS[options.serverKey];
  }
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.ZIPSTAMP_SERVER_URL?.trim()) ||
    (typeof process !== 'undefined' && process.env?.TOKEN_SERVER_URL?.trim());
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_ZIPSTAMP_SERVER_URL;
}

/**
 * Return the default server URL as a single-element array for multi-calendar use.
 * Later can return multiple URLs from ZIPSTAMP_SERVER_URLS or env.
 */
export function getDefaultZipStampServerUrls(): string[] {
  return [getZipStampServerUrl()];
}
