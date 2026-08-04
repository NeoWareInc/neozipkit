/**
 * NeoZip Token Service URL(s), network profiles, and resolvers.
 *
 * Single source of truth for Token Service hosts and the mapping of
 * network name / chainId → server URL.
 *
 * Resolution order for getTokenServiceUrl():
 * 1. options.serverUrl (explicit URL)
 * 2. options.serverKey → TOKEN_SERVICE_URLS[serverKey]
 * 3. options.network / options.chainId → profile → server key → URL
 * 4. process.env.TOKEN_SERVICE_URL
 * 5. env TOKEN_SERVICE_NETWORK / TOKEN_SERVICE_CHAIN_ID / NEOZIP_CHAIN_ID → profile
 * 6. DEFAULT_TOKEN_SERVICE_URL (testnet / Base Sepolia)
 */

/** Default NeoZip Token Service URL (Base Sepolia) */
export const DEFAULT_TOKEN_SERVICE_URL = 'https://testnet.token-service.neozip.io';

/** Production Token Service URL (Base Mainnet) */
export const PRODUCTION_TOKEN_SERVICE_URL = 'https://token-service.neozip.io';

/**
 * Named server URLs for lookup by key.
 * Extend as more servers are added; env vars can still override at runtime.
 */
export const TOKEN_SERVICE_URLS: Record<string, string> = {
  default: DEFAULT_TOKEN_SERVICE_URL,
  testnet: DEFAULT_TOKEN_SERVICE_URL,
  production: PRODUCTION_TOKEN_SERVICE_URL,
  mainnet: PRODUCTION_TOKEN_SERVICE_URL,
};

/** Known network profile keys */
export type NetworkProfileKey = 'base-sepolia' | 'base';

export interface NetworkProfile {
  /** Profile key (stable identifier for env / CLI) */
  key: NetworkProfileKey;
  /** EVM chain ID */
  chainId: number;
  /** Key into TOKEN_SERVICE_URLS */
  serverKey: string;
  /**
   * Whether paid token purchase is available on this network via Token Service.
   * Always false until purchase is implemented.
   */
  purchaseAvailable: boolean;
  /** Human-readable label */
  label: string;
  /** Alternate names accepted by resolveNetworkProfile */
  aliases?: string[];
}

/**
 * Client-side network profiles: chain ↔ Token Service host.
 * Library default remains Base Sepolia.
 */
export const NETWORK_PROFILES: Record<NetworkProfileKey, NetworkProfile> = {
  'base-sepolia': {
    key: 'base-sepolia',
    chainId: 84532,
    serverKey: 'default',
    purchaseAvailable: false,
    label: 'Base Sepolia',
    aliases: ['base sepolia', 'basesepolia', 'base-sepolia-testnet'],
  },
  base: {
    key: 'base',
    chainId: 8453,
    serverKey: 'production',
    purchaseAvailable: false,
    label: 'Base Mainnet',
    aliases: ['base-mainnet', 'base mainnet', 'basemainnet'],
  },
};

/** Default network profile key (safe sandbox) */
export const DEFAULT_NETWORK_PROFILE_KEY: NetworkProfileKey = 'base-sepolia';

export interface GetTokenServiceUrlOptions {
  /** Explicit server URL (highest precedence) */
  serverUrl?: string;
  /** Key into TOKEN_SERVICE_URLS (e.g. "default", "production") */
  serverKey?: string;
  /** Network profile name (e.g. "base-sepolia", "base") */
  network?: string;
  /** Chain ID; selects profile when no serverUrl/serverKey */
  chainId?: number;
}

export interface ResolveNetworkProfileOptions {
  /** Profile name (prefer TOKEN_SERVICE_NETWORK) */
  network?: string;
  /** Numeric chain (TOKEN_SERVICE_CHAIN_ID / NEOZIP_CHAIN_ID) */
  chainId?: number | string;
  /**
   * When true (default), also read process.env for TOKEN_SERVICE_NETWORK,
   * TOKEN_SERVICE_CHAIN_ID, then NEOZIP_CHAIN_ID (deprecated alias).
   */
  useEnv?: boolean;
}

/** Normalize a network name for matching. */
export function normalizeNetworkProfileName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/_/g, '-');
}

function findProfileByName(name: string): NetworkProfile | null {
  const normalized = normalizeNetworkProfileName(name);
  for (const profile of Object.values(NETWORK_PROFILES)) {
    if (profile.key === normalized) return profile;
    if (normalizeNetworkProfileName(profile.label) === normalized) return profile;
    if (profile.aliases?.some((a) => normalizeNetworkProfileName(a) === normalized)) {
      return profile;
    }
  }
  return null;
}

function findProfileByChainId(chainId: number): NetworkProfile | null {
  for (const profile of Object.values(NETWORK_PROFILES)) {
    if (profile.chainId === chainId) return profile;
  }
  return null;
}

/**
 * Resolve a network profile from options and/or environment.
 *
 * Precedence: options.network → options.chainId → TOKEN_SERVICE_NETWORK →
 * TOKEN_SERVICE_CHAIN_ID → NEOZIP_CHAIN_ID (deprecated) → base-sepolia.
 */
export function resolveNetworkProfile(
  input?: string | number | ResolveNetworkProfileOptions
): NetworkProfile {
  let network: string | undefined;
  let chainId: number | string | undefined;
  let useEnv = true;

  if (typeof input === 'string') {
    network = input;
  } else if (typeof input === 'number') {
    chainId = input;
  } else if (input && typeof input === 'object') {
    network = input.network;
    chainId = input.chainId;
    useEnv = input.useEnv !== false;
  }

  if (network && network.trim()) {
    const byName = findProfileByName(network);
    if (!byName) {
      throw new Error(
        `Unknown Token Service network: "${network}". Use "base-sepolia" or "base".`
      );
    }
    return byName;
  }

  const parsedChain =
    chainId === undefined || chainId === null || chainId === ''
      ? undefined
      : typeof chainId === 'number'
        ? chainId
        : parseInt(String(chainId), 10);

  if (parsedChain !== undefined && !Number.isNaN(parsedChain)) {
    const byChain = findProfileByChainId(parsedChain);
    if (!byChain) {
      throw new Error(
        `No Token Service network profile for chainId ${parsedChain}. Supported: 84532 (base-sepolia), 8453 (base).`
      );
    }
    return byChain;
  }

  if (useEnv && typeof process !== 'undefined') {
    const envNetwork = process.env?.TOKEN_SERVICE_NETWORK?.trim();
    if (envNetwork) {
      return resolveNetworkProfile({ network: envNetwork, useEnv: false });
    }
    const envChain =
      process.env?.TOKEN_SERVICE_CHAIN_ID?.trim() ||
      process.env?.NEOZIP_CHAIN_ID?.trim();
    if (envChain) {
      return resolveNetworkProfile({ chainId: envChain, useEnv: false });
    }
  }

  return NETWORK_PROFILES[DEFAULT_NETWORK_PROFILE_KEY];
}

/**
 * Resolve the NeoZip Token Service base URL.
 * Order: serverUrl → serverKey → network/chainId profile →
 * TOKEN_SERVICE_URL → profile from env → default (testnet).
 */
export function getTokenServiceUrl(options?: GetTokenServiceUrlOptions): string {
  if (options?.serverUrl && options.serverUrl.trim()) {
    return options.serverUrl.trim();
  }
  if (options?.serverKey && TOKEN_SERVICE_URLS[options.serverKey]) {
    return TOKEN_SERVICE_URLS[options.serverKey];
  }

  if (options?.network || options?.chainId !== undefined) {
    const profile = resolveNetworkProfile({
      network: options.network,
      chainId: options.chainId,
      useEnv: false,
    });
    const fromKey = TOKEN_SERVICE_URLS[profile.serverKey];
    if (fromKey) return fromKey;
  }

  const fromEnv =
    typeof process !== 'undefined' && process.env?.TOKEN_SERVICE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (typeof process !== 'undefined') {
    const hasNetworkEnv =
      !!process.env?.TOKEN_SERVICE_NETWORK?.trim() ||
      !!process.env?.TOKEN_SERVICE_CHAIN_ID?.trim() ||
      !!process.env?.NEOZIP_CHAIN_ID?.trim();
    if (hasNetworkEnv) {
      const profile = resolveNetworkProfile();
      const fromKey = TOKEN_SERVICE_URLS[profile.serverKey];
      if (fromKey) return fromKey;
    }
  }

  return DEFAULT_TOKEN_SERVICE_URL;
}

/**
 * Resolve Token Service URL for a network name or chain ID.
 */
export function getTokenServiceUrlForNetwork(
  networkOrChainId?: string | number,
  options?: Omit<GetTokenServiceUrlOptions, 'network' | 'chainId'>
): string {
  if (typeof networkOrChainId === 'number') {
    return getTokenServiceUrl({ ...options, chainId: networkOrChainId });
  }
  if (typeof networkOrChainId === 'string' && networkOrChainId.trim()) {
    if (/^https?:\/\//i.test(networkOrChainId.trim())) {
      return getTokenServiceUrl({ ...options, serverUrl: networkOrChainId });
    }
    return getTokenServiceUrl({ ...options, network: networkOrChainId });
  }
  return getTokenServiceUrl(options);
}

/**
 * Whether paid token purchase is available for a network.
 * Stub: always false until purchase is implemented.
 */
export function isTokenPurchaseAvailable(
  networkOrChainId?: string | number
): boolean {
  try {
    if (networkOrChainId === undefined) {
      return resolveNetworkProfile().purchaseAvailable;
    }
    return resolveNetworkProfile(networkOrChainId).purchaseAvailable;
  } catch {
    return false;
  }
}

/**
 * Default server URL as a single-element array (multi-calendar ready).
 */
export function getDefaultTokenServiceUrls(): string[] {
  return [getTokenServiceUrl()];
}
