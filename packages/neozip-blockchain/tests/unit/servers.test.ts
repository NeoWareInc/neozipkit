/**
 * Tests for Token Service URL resolution and network profiles.
 */

import {
  DEFAULT_TOKEN_SERVICE_URL,
  PRODUCTION_TOKEN_SERVICE_URL,
  TOKEN_SERVICE_URLS,
  NETWORK_PROFILES,
  DEFAULT_NETWORK_PROFILE_KEY,
  getTokenServiceUrl,
  getTokenServiceUrlForNetwork,
  resolveNetworkProfile,
  isTokenPurchaseAvailable,
} from '../../src/constants/servers';

describe('Token Service network profiles', () => {
  const envKeys = [
    'TOKEN_SERVICE_URL',
    'TOKEN_SERVICE_NETWORK',
    'TOKEN_SERVICE_CHAIN_ID',
    'NEOZIP_CHAIN_ID',
  ] as const;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  });

  describe('TOKEN_SERVICE_URLS', () => {
    it('maps default/testnet to testnet host and production/mainnet to production host', () => {
      expect(TOKEN_SERVICE_URLS.default).toBe(DEFAULT_TOKEN_SERVICE_URL);
      expect(TOKEN_SERVICE_URLS.testnet).toBe(DEFAULT_TOKEN_SERVICE_URL);
      expect(TOKEN_SERVICE_URLS.production).toBe(PRODUCTION_TOKEN_SERVICE_URL);
      expect(TOKEN_SERVICE_URLS.mainnet).toBe(PRODUCTION_TOKEN_SERVICE_URL);
      expect(DEFAULT_TOKEN_SERVICE_URL).toBe(
        'https://testnet.token-service.neozip.io'
      );
      expect(PRODUCTION_TOKEN_SERVICE_URL).toBe(
        'https://token-service.neozip.io'
      );
    });
  });

  describe('resolveNetworkProfile', () => {
    it('defaults to base-sepolia', () => {
      const profile = resolveNetworkProfile();
      expect(profile.key).toBe(DEFAULT_NETWORK_PROFILE_KEY);
      expect(profile.chainId).toBe(84532);
      expect(profile.serverKey).toBe('default');
      expect(profile.purchaseAvailable).toBe(false);
    });

    it('resolves by name', () => {
      expect(resolveNetworkProfile('base-sepolia').chainId).toBe(84532);
      expect(resolveNetworkProfile('base').chainId).toBe(8453);
      expect(resolveNetworkProfile('base-mainnet').key).toBe('base');
      expect(resolveNetworkProfile('Base Sepolia').key).toBe('base-sepolia');
    });

    it('resolves by chainId', () => {
      expect(resolveNetworkProfile(84532).key).toBe('base-sepolia');
      expect(resolveNetworkProfile(8453).key).toBe('base');
      expect(resolveNetworkProfile({ chainId: '8453' }).key).toBe('base');
    });

    it('reads TOKEN_SERVICE_NETWORK from env', () => {
      process.env.TOKEN_SERVICE_NETWORK = 'base';
      expect(resolveNetworkProfile().key).toBe('base');
      expect(resolveNetworkProfile().chainId).toBe(8453);
    });

    it('prefers TOKEN_SERVICE_CHAIN_ID over NEOZIP_CHAIN_ID', () => {
      process.env.NEOZIP_CHAIN_ID = '8453';
      process.env.TOKEN_SERVICE_CHAIN_ID = '84532';
      expect(resolveNetworkProfile().chainId).toBe(84532);
    });

    it('falls back to NEOZIP_CHAIN_ID when TOKEN_SERVICE_CHAIN_ID unset', () => {
      process.env.NEOZIP_CHAIN_ID = '8453';
      expect(resolveNetworkProfile().key).toBe('base');
    });

    it('throws on unknown network name', () => {
      expect(() => resolveNetworkProfile('polygon')).toThrow(
        /Unknown Token Service network/
      );
    });

    it('throws on unsupported chainId', () => {
      expect(() => resolveNetworkProfile(1)).toThrow(
        /No Token Service network profile/
      );
    });
  });

  describe('getTokenServiceUrl', () => {
    it('returns default testnet URL with no options or env', () => {
      expect(getTokenServiceUrl()).toBe(DEFAULT_TOKEN_SERVICE_URL);
    });

    it('honors explicit serverUrl over everything', () => {
      process.env.TOKEN_SERVICE_URL = 'https://should-not-use.example';
      expect(getTokenServiceUrl({ serverUrl: 'https://custom.example' })).toBe(
        'https://custom.example'
      );
    });

    it('honors serverKey', () => {
      expect(getTokenServiceUrl({ serverKey: 'production' })).toBe(
        PRODUCTION_TOKEN_SERVICE_URL
      );
    });

    it('maps base to production host', () => {
      expect(getTokenServiceUrl({ network: 'base' })).toBe(
        PRODUCTION_TOKEN_SERVICE_URL
      );
      expect(getTokenServiceUrl({ chainId: 8453 })).toBe(
        PRODUCTION_TOKEN_SERVICE_URL
      );
    });

    it('maps base-sepolia to testnet host', () => {
      expect(getTokenServiceUrl({ network: 'base-sepolia' })).toBe(
        DEFAULT_TOKEN_SERVICE_URL
      );
      expect(getTokenServiceUrl({ chainId: 84532 })).toBe(
        DEFAULT_TOKEN_SERVICE_URL
      );
    });

    it('uses TOKEN_SERVICE_URL env when set and no network option', () => {
      process.env.TOKEN_SERVICE_URL = 'https://override.example';
      expect(getTokenServiceUrl()).toBe('https://override.example');
    });

    it('uses profile from TOKEN_SERVICE_NETWORK when TOKEN_SERVICE_URL unset', () => {
      process.env.TOKEN_SERVICE_NETWORK = 'base';
      expect(getTokenServiceUrl()).toBe(PRODUCTION_TOKEN_SERVICE_URL);
    });
  });

  describe('getTokenServiceUrlForNetwork', () => {
    it('resolves production URL for base mainnet', () => {
      expect(getTokenServiceUrlForNetwork('base')).toBe(
        PRODUCTION_TOKEN_SERVICE_URL
      );
      expect(getTokenServiceUrlForNetwork(8453)).toBe(
        PRODUCTION_TOKEN_SERVICE_URL
      );
    });
  });

  describe('isTokenPurchaseAvailable', () => {
    it('is false for all profiles (purchase coming soon)', () => {
      expect(isTokenPurchaseAvailable()).toBe(false);
      expect(isTokenPurchaseAvailable('base')).toBe(false);
      expect(isTokenPurchaseAvailable('base-sepolia')).toBe(false);
      expect(isTokenPurchaseAvailable(8453)).toBe(false);
      expect(NETWORK_PROFILES.base.purchaseAvailable).toBe(false);
      expect(NETWORK_PROFILES['base-sepolia'].purchaseAvailable).toBe(false);
    });
  });
});
