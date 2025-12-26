/**
 * Contract Version Compatibility Tests
 * 
 * Tests backward compatibility with NZIP files created using different contract versions.
 * Ensures that:
 * 1. Old NZIP.TOKEN files can be correctly parsed
 * 2. Missing fields are properly migrated/inferred
 * 3. Correct adapters are selected for each version
 * 4. Version capabilities are correctly identified
 */

import { ZipkitVerifier } from '../../../src/blockchain/core/ZipkitVerifier';
import { getAdapter, getAdapterByChainId } from '../../../src/blockchain/core/adapters/AdapterFactory';
import { getVersionCapabilities, isVersionSupported, normalizeVersion, getSupportedVersions } from '../../../src/blockchain/core/ContractVersionRegistry';
import { getContractConfig } from '../../../src/blockchain/core/contracts';
import type { TokenMetadata } from '../../../src/types';

describe('Contract Version Compatibility', () => {
  let verifier: ZipkitVerifier;

  beforeEach(() => {
    verifier = new ZipkitVerifier({ debug: false });
  });

  describe('Version Registry', () => {
    it('should identify all supported versions', () => {
      const versions = getSupportedVersions();
      expect(versions).toContain('2.10');
      expect(versions).toContain('2.11');
    });

    it('should normalize version strings correctly', () => {
      expect(normalizeVersion('2.11.0')).toBe('2.11');
      expect(normalizeVersion('2.10')).toBe('2.10');
      expect(normalizeVersion('2.11')).toBe('2.11');
      expect(normalizeVersion('unknown')).toBe('');
      expect(normalizeVersion('')).toBe('');
    });

    it('should check if versions are supported', () => {
      expect(isVersionSupported('2.10')).toBe(true);
      expect(isVersionSupported('2.11')).toBe(true);
      expect(isVersionSupported('2.11.0')).toBe(true);
      expect(isVersionSupported('2.0')).toBe(false); // Not yet implemented
      expect(isVersionSupported('3.0')).toBe(false);
    });

    it('should get capabilities for supported versions', () => {
      const v2_10 = getVersionCapabilities('2.10');
      expect(v2_10).not.toBeNull();
      expect(v2_10?.supportsEncryptedHash).toBe(false);
      expect(v2_10?.supportsFileName).toBe(false);
      expect(v2_10?.publicMintZipFileSignature).toBe('v2.10');

      const v2_11 = getVersionCapabilities('2.11');
      expect(v2_11).not.toBeNull();
      expect(v2_11?.supportsEncryptedHash).toBe(true);
      expect(v2_11?.supportsFileName).toBe(false);
      expect(v2_11?.publicMintZipFileSignature).toBe('v2.11');
    });
  });

  describe('Adapter Factory', () => {
    it('should get correct adapter for v2.10', () => {
      const adapter = getAdapter('2.10');
      expect(adapter.version).toBe('2.10');
    });

    it('should get correct adapter for v2.11', () => {
      const adapter = getAdapter('2.11');
      expect(adapter.version).toBe('2.11');
    });

    it('should normalize version before getting adapter', () => {
      const adapter1 = getAdapter('2.11.0');
      expect(adapter1.version).toBe('2.11');

      const adapter2 = getAdapter('2.10');
      expect(adapter2.version).toBe('2.10');
    });

    it('should throw error for unsupported version', () => {
      expect(() => getAdapter('2.0')).toThrow('Unsupported contract version');
      expect(() => getAdapter('3.0')).toThrow('Unsupported contract version');
    });

    it('should get adapter by chainId', () => {
      // Base Sepolia uses v2.11
      const adapter1 = getAdapterByChainId(84532);
      expect(adapter1.version).toBe('2.11');

      // Base Mainnet uses v2.10
      const adapter2 = getAdapterByChainId(8453);
      expect(adapter2.version).toBe('2.10');
    });
  });

  describe('NZIP.TOKEN File Parsing - v2.10', () => {
    it('should parse v2.10 TOKEN file with all required fields', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        networkChainId: 8453,
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890',
        transactionHash: '0x1234567890abcdef',
        blockNumber: 12345,
        mintDate: '2024-01-01 at 12:00:00',
        creationTimestamp: 1704110400
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.tokenId).toBe('123');
      expect(result.metadata?.contractVersion).toBe('2.10');
      expect(result.metadata?.networkChainId).toBe(8453);
      expect(result.metadata?.encryptedHash).toBeUndefined(); // v2.10 doesn't support encryptedHash
    });

    it('should parse v2.10 TOKEN file with missing networkChainId (migration)', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        // networkChainId missing - should be inferred
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.networkChainId).toBe(8453); // Inferred from network name
    });

    it('should parse v2.10 TOKEN file with missing contractVersion (migration)', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        networkChainId: 8453,
        // contractVersion missing - should be inferred
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.contractVersion).toBe('2.10'); // Inferred from chainId config
    });

    it('should parse v2.10 TOKEN file with legacy chainId field (migration)', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        chainId: 8453, // Old field name
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.networkChainId).toBe(8453); // Migrated from chainId
    });
  });

  describe('NZIP.TOKEN File Parsing - v2.11', () => {
    it('should parse v2.11 TOKEN file with all required fields including encryptedHash', async () => {
      const tokenData = {
        tokenId: '456',
        contractAddress: '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e',
        network: 'Base Sepolia',
        networkChainId: 84532,
        contractVersion: '2.11',
        merkleRoot: '0xabcdef1234567890',
        encryptedHash: '0x9876543210fedcba', // v2.11 supports encryptedHash
        transactionHash: '0xabcdef1234567890',
        blockNumber: 67890,
        mintedAt: '2024-01-02T12:00:00.000Z',
        creationTimestamp: 1704196800
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.tokenId).toBe('456');
      expect(result.metadata?.contractVersion).toBe('2.11');
      expect(result.metadata?.networkChainId).toBe(84532);
      expect(result.metadata?.encryptedHash).toBe('0x9876543210fedcba'); // v2.11 supports encryptedHash
    });

    it('should parse v2.11 TOKEN file with missing fields (migration)', async () => {
      const tokenData = {
        tokenId: '456',
        contractAddress: '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e',
        network: 'Base Sepolia',
        // networkChainId and contractVersion missing - should be inferred
        merkleRoot: '0xabcdef1234567890',
        encryptedHash: '0x9876543210fedcba'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.networkChainId).toBe(84532); // Inferred from network name
      expect(result.metadata?.contractVersion).toBe('2.11'); // Inferred from chainId config
    });
  });

  describe('NZIP.TOKEN File Parsing - Legacy/Old Formats', () => {
    it('should handle TOKEN file with minimal fields (oldest format)', async () => {
      const tokenData = {
        tokenId: '789',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        merkleRoot: '0xabcdef1234567890'
        // Missing networkChainId, contractVersion - should be inferred
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.networkChainId).toBe(8453); // Inferred
      expect(result.metadata?.contractVersion).toBe('2.10'); // Inferred from Base Mainnet config
    });

    it('should fail if required fields cannot be inferred', async () => {
      const tokenData = {
        tokenId: '789',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Unknown Network', // Unknown network - cannot infer
        merkleRoot: '0xabcdef1234567890'
        // Missing networkChainId, contractVersion
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('networkChainId');
    });

    it('should handle TOKEN file with both mintDate and mintedAt', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        networkChainId: 8453,
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890',
        mintDate: '2024-01-01 at 12:00:00',
        mintedAt: '2024-01-01T12:00:00.000Z'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      // Both fields should be preserved
      expect(result.metadata?.mintDate).toBe('2024-01-01 at 12:00:00');
      expect(result.metadata?.mintedAt).toBe('2024-01-01T12:00:00.000Z');
    });
  });

  describe('Adapter Selection Based on Contract Version', () => {
    it('should select v2.10 adapter for Base Mainnet tokens', () => {
      const config = getContractConfig(8453);
      expect(config?.version).toBe('2.10');
      
      const adapter = getAdapterByChainId(8453);
      expect(adapter.version).toBe('2.10');
    });

    it('should select v2.11 adapter for Base Sepolia tokens', () => {
      const config = getContractConfig(84532);
      expect(config?.version).toBe('2.11');
      
      const adapter = getAdapterByChainId(84532);
      expect(adapter.version).toBe('2.11');
    });

    it('should use correct adapter based on metadata contractVersion', async () => {
      // Test v2.10
      const tokenData_v2_10 = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        networkChainId: 8453,
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer_v2_10 = Buffer.from(JSON.stringify(tokenData_v2_10));
      const result_v2_10 = await verifier.extractTokenMetadata(buffer_v2_10);
      
      expect(result_v2_10.success).toBe(true);
      expect(result_v2_10.metadata?.contractVersion).toBe('2.10');
      
      const adapter_v2_10 = getAdapter(result_v2_10.metadata!.contractVersion);
      expect(adapter_v2_10.version).toBe('2.10');

      // Test v2.11
      const tokenData_v2_11 = {
        tokenId: '456',
        contractAddress: '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e',
        network: 'Base Sepolia',
        networkChainId: 84532,
        contractVersion: '2.11',
        merkleRoot: '0xabcdef1234567890',
        encryptedHash: '0x9876543210fedcba'
      };

      const buffer_v2_11 = Buffer.from(JSON.stringify(tokenData_v2_11));
      const result_v2_11 = await verifier.extractTokenMetadata(buffer_v2_11);
      
      expect(result_v2_11.success).toBe(true);
      expect(result_v2_11.metadata?.contractVersion).toBe('2.11');
      
      const adapter_v2_11 = getAdapter(result_v2_11.metadata!.contractVersion);
      expect(adapter_v2_11.version).toBe('2.11');
    });
  });

  describe('Version Capabilities Validation', () => {
    it('should correctly identify v2.10 capabilities', () => {
      const capabilities = getVersionCapabilities('2.10');
      expect(capabilities).not.toBeNull();
      expect(capabilities?.supportsEncryptedHash).toBe(false);
      expect(capabilities?.supportsFileName).toBe(false);
      expect(capabilities?.getZipFileInfoFields).toContain('merkleRootHash');
      expect(capabilities?.getZipFileInfoFields).not.toContain('encryptedHash');
    });

    it('should correctly identify v2.11 capabilities', () => {
      const capabilities = getVersionCapabilities('2.11');
      expect(capabilities).not.toBeNull();
      expect(capabilities?.supportsEncryptedHash).toBe(true);
      expect(capabilities?.supportsFileName).toBe(false);
      expect(capabilities?.getZipFileInfoFields).toContain('merkleRootHash');
      expect(capabilities?.getZipFileInfoFields).toContain('encryptedHash');
    });

    it('should validate encryptedHash presence based on version', async () => {
      // v2.10 should not have encryptedHash
      const tokenData_v2_10 = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        networkChainId: 8453,
        contractVersion: '2.10',
        merkleRoot: '0xabcdef1234567890'
        // No encryptedHash - correct for v2.10
      };

      const buffer = Buffer.from(JSON.stringify(tokenData_v2_10));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(true);
      expect(result.metadata?.encryptedHash).toBeUndefined();

      // v2.11 can have encryptedHash
      const tokenData_v2_11 = {
        tokenId: '456',
        contractAddress: '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e',
        network: 'Base Sepolia',
        networkChainId: 84532,
        contractVersion: '2.11',
        merkleRoot: '0xabcdef1234567890',
        encryptedHash: '0x9876543210fedcba' // Valid for v2.11
      };

      const buffer2 = Buffer.from(JSON.stringify(tokenData_v2_11));
      const result2 = await verifier.extractTokenMetadata(buffer2);

      expect(result2.success).toBe(true);
      expect(result2.metadata?.encryptedHash).toBe('0x9876543210fedcba');
    });
  });

  describe('Error Handling', () => {
    it('should fail if tokenId is missing', async () => {
      const tokenData = {
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('tokenId');
    });

    it('should fail if contractAddress is missing', async () => {
      const tokenData = {
        tokenId: '123',
        network: 'Base Mainnet',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('contractAddress');
    });

    it('should fail if merkleRoot is missing', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Base Mainnet'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('merkleRoot');
    });

    it('should fail if networkChainId cannot be inferred', async () => {
      const tokenData = {
        tokenId: '123',
        contractAddress: '0xd871Fba59F85108aF29299786DD8243B38dD9686',
        network: 'Unknown Network',
        merkleRoot: '0xabcdef1234567890'
      };

      const buffer = Buffer.from(JSON.stringify(tokenData));
      const result = await verifier.extractTokenMetadata(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('networkChainId');
    });
  });
});

