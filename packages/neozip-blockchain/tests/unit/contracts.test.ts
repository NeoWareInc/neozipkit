/**
 * Tests for contract configuration and utilities
 */

import {
  CONTRACT_CONFIGS,
  getContractConfig,
  isNetworkSupported,
  getChainIdByName,
  getNetworkByName,
  getSupportedNetworkNames,
  normalizeNetworkName,
  fuzzyMatchNetworkName,
  DEFAULT_NETWORK,
  DEFAULT_CONTRACT_VERSION,
  CURRENT_DEPLOYMENT,
  getContractAdapter,
  getContractAdapterByVersion,
} from '../../src/core/contracts';

describe('Contract Configuration', () => {
  describe('CONTRACT_CONFIGS', () => {
    it('should have Base Sepolia configuration', () => {
      expect(CONTRACT_CONFIGS[84532]).toBeDefined();
      expect(CONTRACT_CONFIGS[84532].network).toBe('Base Sepolia');
      expect(CONTRACT_CONFIGS[84532].version).toBe('2.51');
      expect(CONTRACT_CONFIGS[84532].address).toBe('0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77');
      expect(CONTRACT_CONFIGS[84532].registryAddress).toBe('0x3CFc4E3886839dC859f611887660783a3EE241b4');
      expect(CONTRACT_CONFIGS[84532].registryVersion).toBe('0.90');
    });

    it('should have Base Mainnet configuration', () => {
      expect(CONTRACT_CONFIGS[8453]).toBeDefined();
      expect(CONTRACT_CONFIGS[8453].network).toBe('Base Mainnet');
      expect(CONTRACT_CONFIGS[8453].version).toBe('2.10');
    });

    it('should have Arbitrum One configuration', () => {
      expect(CONTRACT_CONFIGS[42161]).toBeDefined();
      expect(CONTRACT_CONFIGS[42161].network).toBe('Arbitrum One');
    });
  });

  describe('getContractConfig', () => {
    it('should return config for valid chain ID', () => {
      const config = getContractConfig(84532);
      expect(config.network).toBe('Base Sepolia');
      expect(config.chainId).toBe(84532);
    });

    it('should return default config for unknown chain ID', () => {
      const config = getContractConfig(999999);
      expect(config.chainId).toBe(DEFAULT_NETWORK);
    });
  });

  describe('isNetworkSupported', () => {
    it('should return true for supported networks', () => {
      expect(isNetworkSupported(84532)).toBe(true);
      expect(isNetworkSupported(8453)).toBe(true);
      expect(isNetworkSupported(42161)).toBe(true);
    });

    it('should return false for unsupported networks', () => {
      expect(isNetworkSupported(999999)).toBe(false);
      expect(isNetworkSupported(0)).toBe(false);
    });
  });

  describe('getChainIdByName', () => {
    it('should find chain ID by network name', () => {
      expect(getChainIdByName('base-sepolia')).toBe(84532);
      expect(getChainIdByName('Base Sepolia')).toBe(84532);
    });

    it('should find chain ID by alias', () => {
      expect(getChainIdByName('basesepolia')).toBe(84532);
      expect(getChainIdByName('base sepolia')).toBe(84532);
    });

    it('should return null for unknown network', () => {
      expect(getChainIdByName('unknown-network')).toBeNull();
    });
  });

  describe('getNetworkByName', () => {
    it('should return config for valid network name', () => {
      const config = getNetworkByName('base-sepolia');
      expect(config).not.toBeNull();
      expect(config?.chainId).toBe(84532);
    });

    it('should return null for invalid network name', () => {
      const config = getNetworkByName('invalid-network');
      expect(config).toBeNull();
    });
  });

  describe('getSupportedNetworkNames', () => {
    it('should return array of network names', () => {
      const names = getSupportedNetworkNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('Base Sepolia');
      expect(names).toContain('base-sepolia');
    });
  });

  describe('normalizeNetworkName', () => {
    it('should normalize network names', () => {
      expect(normalizeNetworkName('Base Sepolia')).toBe('base-sepolia');
      expect(normalizeNetworkName('BASE_SEPOLIA')).toBe('base-sepolia');
      expect(normalizeNetworkName('  base sepolia  ')).toBe('base-sepolia');
    });
  });

  describe('fuzzyMatchNetworkName', () => {
    it('should match exact names', () => {
      const match = fuzzyMatchNetworkName('base-sepolia');
      expect(match).not.toBeNull();
      expect(match?.chainId).toBe(84532);
    });

    it('should match partial names', () => {
      const match = fuzzyMatchNetworkName('sepolia');
      expect(match).not.toBeNull();
      // Should match one of the sepolia networks
      expect([84532, 11155111, 421614]).toContain(match?.chainId);
    });

    it('should return null for no match', () => {
      const match = fuzzyMatchNetworkName('xyz-invalid-network');
      expect(match).toBeNull();
    });
  });

  describe('DEFAULT_NETWORK and CURRENT_DEPLOYMENT', () => {
    it('should use Base Sepolia as default network', () => {
      expect(DEFAULT_NETWORK).toBe(84532);
      expect(CURRENT_DEPLOYMENT).toBe(CONTRACT_CONFIGS[84532]);
      expect(CURRENT_DEPLOYMENT.version).toBe('2.51');
    });
  });

  describe('DEFAULT_CONTRACT_VERSION', () => {
    it('should be a supported version', () => {
      expect(DEFAULT_CONTRACT_VERSION).toBe('2.50');
      expect(['2.50', '2.51', '2.11', '2.10']).toContain(DEFAULT_CONTRACT_VERSION);
    });
  });

  describe('getContractAdapter', () => {
    it('should return adapter for Base Sepolia (v2.51 config uses V2_50Adapter)', () => {
      const adapter = getContractAdapter(84532);
      expect(adapter).toBeDefined();
      // v2.51 uses V2_50Adapter (same ABI); adapter.version is '2.50'
      expect(adapter.version).toBe('2.50');
    });

    it('should return adapter for Base Mainnet (v2.10)', () => {
      const adapter = getContractAdapter(8453);
      expect(adapter).toBeDefined();
      expect(adapter.version).toBe('2.10');
    });

    it('should return default adapter for unknown chain ID (fallback to CURRENT_DEPLOYMENT)', () => {
      // getContractConfig(999999) returns CURRENT_DEPLOYMENT, so we get Base Sepolia's adapter
      const adapter = getContractAdapter(999999);
      expect(adapter).toBeDefined();
      expect(adapter.version).toBe('2.50');
    });
  });

  describe('getContractAdapterByVersion', () => {
    it('should return adapter for v2.51 (uses V2_50Adapter)', () => {
      const adapter = getContractAdapterByVersion('2.51');
      expect(adapter).toBeDefined();
      expect(adapter.version).toBe('2.50');
    });

    it('should return adapter for v2.50', () => {
      const adapter = getContractAdapterByVersion('2.50');
      expect(adapter).toBeDefined();
      expect(adapter.version).toBe('2.50');
    });

    it('should throw for unsupported version', () => {
      expect(() => getContractAdapterByVersion('1.0')).toThrow();
    });
  });
});

