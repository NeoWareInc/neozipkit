/**
 * Unit tests for HashCalculator
 * Tests incremental hash calculation, hash accumulation, and Merkle tree functionality
 */

import { HashCalculator } from '../../../../src/core/components/HashCalculator';
import { crc32, sha256 } from '../../../../src/core/encryption/ZipCrypto';
import { createHash } from 'crypto';

describe('HashCalculator', () => {
  describe('Incremental Hash Calculation (CRC-32)', () => {
    it('should calculate CRC-32 incrementally', () => {
      const calculator = new HashCalculator();
      const data = Buffer.from('test');
      
      calculator.update(data);
      const result = calculator.finalizeCRC32();
      
      // Should match direct calculation
      const expected = crc32('test');
      expect(result).toBe(expected);
    });

    it('should handle empty data', () => {
      const calculator = new HashCalculator();
      const result = calculator.finalizeCRC32();
      expect(result).toBe(0x00000000);
    });

    it('should handle multiple updates', () => {
      const calculator = new HashCalculator();
      
      calculator.update(Buffer.from('Hello'));
      calculator.update(Buffer.from(' '));
      calculator.update(Buffer.from('World'));
      
      const result = calculator.finalizeCRC32();
      const expected = crc32('Hello World');
      expect(result).toBe(expected);
    });

    it('should reset correctly', () => {
      const calculator = new HashCalculator();
      calculator.update(Buffer.from('test'));
      calculator.reset();
      
      const result = calculator.finalizeCRC32();
      expect(result).toBe(0x00000000);
    });

    it('should handle large chunks', () => {
      const calculator = new HashCalculator();
      const largeData = Buffer.alloc(1024 * 1024, 'A');
      
      calculator.update(largeData);
      const result = calculator.finalizeCRC32();
      
      const expected = crc32(largeData);
      expect(result).toBe(expected);
    });
  });

  describe('Incremental Hash Calculation (SHA-256)', () => {
    it('should calculate SHA-256 incrementally when enabled', () => {
      const calculator = new HashCalculator({ useSHA256: true });
      const data = Buffer.from('test');
      
      calculator.update(data);
      const result = calculator.finalizeSHA256();
      
      expect(result).not.toBeNull();
      expect(result).toBe(sha256(data));
    });

    it('should return null for SHA-256 when not enabled', () => {
      const calculator = new HashCalculator();
      calculator.update(Buffer.from('test'));
      
      const result = calculator.finalizeSHA256();
      expect(result).toBeNull();
    });

    it('should handle multiple updates for SHA-256', () => {
      const calculator = new HashCalculator({ useSHA256: true });
      
      calculator.update(Buffer.from('Hello'));
      calculator.update(Buffer.from(' '));
      calculator.update(Buffer.from('World'));
      
      const result = calculator.finalizeSHA256();
      const expected = sha256(Buffer.from('Hello World'));
      expect(result).toBe(expected);
    });

    it('should reset SHA-256 correctly', () => {
      const calculator = new HashCalculator({ useSHA256: true });
      calculator.update(Buffer.from('test'));
      calculator.reset();
      calculator.update(Buffer.from('test'));
      
      const result = calculator.finalizeSHA256();
      const expected = sha256(Buffer.from('test'));
      expect(result).toBe(expected);
    });

    it('should calculate both CRC-32 and SHA-256 when both enabled', () => {
      const calculator = new HashCalculator({ useSHA256: true });
      const data = Buffer.from('test');
      
      calculator.update(data);
      
      const crcResult = calculator.finalizeCRC32();
      const shaResult = calculator.finalizeSHA256();
      
      expect(crcResult).toBe(crc32(data));
      expect(shaResult).toBe(sha256(data));
    });
  });

  describe('Hash Accumulation (XOR)', () => {
    it('should throw error when accumulation not enabled', () => {
      const calculator = new HashCalculator();
      
      expect(() => {
        calculator.addHash(Buffer.alloc(32, 0));
      }).toThrow('Hash accumulation not enabled');
    });

    it('should accumulate hashes with XOR', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      
      const hash1 = Buffer.from('a'.repeat(64), 'hex'); // 32 bytes
      const hash2 = Buffer.from('b'.repeat(64), 'hex'); // 32 bytes
      
      calculator.addHash(hash1);
      calculator.addHash(hash2);
      
      const xorResult = calculator.xorHash();
      expect(xorResult).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle single hash', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      const hash = Buffer.from('a'.repeat(64), 'hex');
      
      calculator.addHash(hash);
      const xorResult = calculator.xorHash();
      
      expect(xorResult).toBe(hash.toString('hex'));
    });

    it('should handle string hashes', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      const hashHex = 'a'.repeat(64);
      
      calculator.addHash(hashHex);
      const xorResult = calculator.xorHash();
      
      expect(xorResult).toBe(hashHex);
    });

    it('should XOR multiple hashes correctly', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      
      // Create test hashes
      const hash1 = Buffer.alloc(32, 0xFF);
      const hash2 = Buffer.alloc(32, 0xAA);
      
      calculator.addHash(hash1);
      calculator.addHash(hash2);
      
      // Manually calculate expected XOR
      const expected = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        expected[i] = hash1[i] ^ hash2[i];
      }
      
      const xorResult = calculator.xorHash();
      expect(xorResult).toBe(expected.toString('hex'));
    });
  });

  describe('Merkle Tree', () => {
    it('should throw error when accumulation not enabled', () => {
      const calculator = new HashCalculator();
      
      expect(() => {
        calculator.merkleRoot();
      }).toThrow('Hash accumulation not enabled');
    });

    it('should return null for empty Merkle tree', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      const result = calculator.merkleRoot();
      expect(result).toBeNull();
    });

    it('should create Merkle root for single hash', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      const hash = Buffer.from('a'.repeat(64), 'hex');
      
      calculator.addHash(hash);
      const root = calculator.merkleRoot();
      
      expect(root).not.toBeNull();
      expect(root).toMatch(/^[0-9a-f]{64}$/);
      // Single hash should be the root itself (if hashLeaves is false)
      expect(root).toBe(hash.toString('hex'));
    });

    it('should create Merkle root for two hashes', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      const hash1 = Buffer.from('a'.repeat(64), 'hex');
      const hash2 = Buffer.from('b'.repeat(64), 'hex');
      
      calculator.addHash(hash1);
      calculator.addHash(hash2);
      
      const root = calculator.merkleRoot();
      
      expect(root).not.toBeNull();
      expect(root).toMatch(/^[0-9a-f]{64}$/);
      
      // Root should be hash of concatenated hashes
      const expectedRoot = createHash('sha256')
        .update(Buffer.concat([hash1, hash2]))
        .digest('hex');
      expect(root).toBe(expectedRoot);
    });

    it('should create Merkle root for multiple hashes', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      
      const hashes = [
        Buffer.from('a'.repeat(64), 'hex'),
        Buffer.from('b'.repeat(64), 'hex'),
        Buffer.from('c'.repeat(64), 'hex'),
        Buffer.from('d'.repeat(64), 'hex'),
      ];
      
      hashes.forEach(hash => calculator.addHash(hash));
      
      const root = calculator.merkleRoot();
      expect(root).not.toBeNull();
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle odd number of hashes', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      
      const hashes = [
        Buffer.from('a'.repeat(64), 'hex'),
        Buffer.from('b'.repeat(64), 'hex'),
        Buffer.from('c'.repeat(64), 'hex'),
      ];
      
      hashes.forEach(hash => calculator.addHash(hash));
      
      const root = calculator.merkleRoot();
      expect(root).not.toBeNull();
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should rebuild Merkle tree when hash is added', () => {
      const calculator = new HashCalculator({ enableAccumulation: true });
      
      calculator.addHash(Buffer.from('a'.repeat(64), 'hex'));
      const root1 = calculator.merkleRoot();
      
      calculator.addHash(Buffer.from('b'.repeat(64), 'hex'));
      const root2 = calculator.merkleRoot();
      
      expect(root1).not.toBe(root2);
    });
  });

  describe('Combined Functionality', () => {
    it('should support both incremental and accumulation modes', () => {
      const calculator = new HashCalculator({ 
        useSHA256: true, 
        enableAccumulation: true 
      });
      
      // Incremental mode
      calculator.update(Buffer.from('test'));
      const crc = calculator.finalizeCRC32();
      const sha = calculator.finalizeSHA256();
      
      expect(crc).toBe(crc32(Buffer.from('test')));
      expect(sha).toBe(sha256(Buffer.from('test')));
      
      // Accumulation mode
      const hash = Buffer.from('a'.repeat(64), 'hex');
      calculator.addHash(hash);
      const xor = calculator.xorHash();
      
      expect(xor).toBe(hash.toString('hex'));
    });
  });
});

