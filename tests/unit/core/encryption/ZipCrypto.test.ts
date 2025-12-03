/**
 * Unit tests for ZipCrypto encryption and hash functions
 * Tests CRC-32 and SHA-256 calculations
 */

import { crc32, crc32update, sha256 } from '../../../../src/core/encryption/ZipCrypto';

describe('ZipCrypto - CRC-32 Functions', () => {
  describe('crc32', () => {
    it('should calculate CRC-32 for empty buffer', () => {
      const result = crc32(Buffer.alloc(0));
      expect(result).toBe(0x00000000);
    });

    it('should calculate CRC-32 for empty string', () => {
      const result = crc32('');
      expect(result).toBe(0x00000000);
    });

    it('should calculate CRC-32 for "test" string', () => {
      const result = crc32('test');
      // Known CRC-32 value for "test" (PKZIP standard)
      expect(result).toBe(0xD87F7E0C);
    });

    it('should calculate CRC-32 for "test" Buffer', () => {
      const buffer = Buffer.from('test');
      const result = crc32(buffer);
      expect(result).toBe(0xD87F7E0C);
    });

    it('should calculate CRC-32 for "123456789" (standard test vector)', () => {
      const result = crc32('123456789');
      // Standard CRC-32 test vector
      expect(result).toBe(0xCBF43926);
    });

    it('should calculate CRC-32 for "Hello, World!"', () => {
      const result = crc32('Hello, World!');
      expect(result).toBe(0xEC4AC3D0);
    });

    it('should calculate CRC-32 for single character', () => {
      const result = crc32('A');
      expect(result).toBe(0xD3D99E8B);
    });

    it('should handle large buffers', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024, 'A');
      const result = crc32(largeBuffer);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xFFFFFFFF);
    });

    it('should produce same result for string and Buffer of same content', () => {
      const stringResult = crc32('test string');
      const bufferResult = crc32(Buffer.from('test string'));
      expect(stringResult).toBe(bufferResult);
    });

    it('should handle Unicode strings', () => {
      const result = crc32('测试');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xFFFFFFFF);
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const result = crc32(binaryData);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xFFFFFFFF);
    });

    it('should be deterministic (same input produces same output)', () => {
      const data = 'deterministic test';
      const result1 = crc32(data);
      const result2 = crc32(data);
      expect(result1).toBe(result2);
    });

    it('should produce different results for different inputs', () => {
      const result1 = crc32('test1');
      const result2 = crc32('test2');
      expect(result1).not.toBe(result2);
    });
  });

  describe('crc32update', () => {
    it('should incrementally update CRC-32 byte by byte', () => {
      const data = Buffer.from('test');
      let crc = ~0; // Initial CRC value
      
      // Update CRC for each byte
      for (let i = 0; i < data.length; i++) {
        crc = crc32update(crc, data[i]);
      }
      
      // Finalize CRC
      crc = ~crc >>> 0;
      
      // Should match direct calculation
      const expected = crc32('test');
      expect(crc).toBe(expected);
    });

    it('should handle empty data incrementally', () => {
      // Test that crc32update works with initial CRC value
      let crc = ~0;
      // Updating with a byte should change the CRC
      crc = crc32update(crc, 0x41); // 'A'
      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThanOrEqual(0);
      // Finalize
      crc = ~crc >>> 0;
      // Should match direct calculation
      const expected = crc32(Buffer.from([0x41]));
      expect(crc).toBe(expected);
    });

    it('should produce same result as crc32 for single byte', () => {
      const byte = 0x41; // 'A'
      let crc = ~0;
      crc = crc32update(crc, byte);
      crc = ~crc >>> 0;
      
      const expected = crc32(Buffer.from([byte]));
      expect(crc).toBe(expected);
    });

    it('should handle incremental updates correctly', () => {
      const data1 = Buffer.from('Hello');
      const data2 = Buffer.from(' World');
      
      // Calculate CRC incrementally
      let crc = ~0;
      for (const byte of data1) {
        crc = crc32update(crc, byte);
      }
      for (const byte of data2) {
        crc = crc32update(crc, byte);
      }
      crc = ~crc >>> 0;
      
      // Should match direct calculation
      const expected = crc32(Buffer.concat([data1, data2]));
      expect(crc).toBe(expected);
    });

    it('should handle all byte values (0-255)', () => {
      let crc = ~0;
      for (let i = 0; i < 256; i++) {
        crc = crc32update(crc, i);
      }
      crc = ~crc >>> 0;
      
      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFFFFFF);
    });
  });
});

describe('ZipCrypto - SHA-256 Functions', () => {
  describe('sha256', () => {
    it('should calculate SHA-256 for empty buffer', () => {
      const result = sha256(Buffer.alloc(0));
      // SHA-256 of empty string (standard test vector)
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should calculate SHA-256 for "test" string', () => {
      const result = sha256(Buffer.from('test'));
      // SHA-256 of "test"
      expect(result).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should calculate SHA-256 for "Hello, World!"', () => {
      const result = sha256(Buffer.from('Hello, World!'));
      expect(result).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should calculate SHA-256 for standard test vector "abc"', () => {
      const result = sha256(Buffer.from('abc'));
      // Standard SHA-256 test vector
      expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('should calculate SHA-256 for standard test vector "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"', () => {
      const testString = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      const result = sha256(Buffer.from(testString));
      // Standard SHA-256 test vector
      expect(result).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('should handle large buffers', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024, 'A');
      const result = sha256(largeBuffer);
      expect(result).toMatch(/^[0-9a-f]{64}$/); // Should be 64 hex characters
    });

    it('should produce same result for same input', () => {
      const data = Buffer.from('deterministic test');
      const result1 = sha256(data);
      const result2 = sha256(data);
      expect(result1).toBe(result2);
    });

    it('should produce different results for different inputs', () => {
      const result1 = sha256(Buffer.from('test1'));
      const result2 = sha256(Buffer.from('test2'));
      expect(result1).not.toBe(result2);
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const result = sha256(binaryData);
      expect(result).toMatch(/^[0-9a-f]{64}$/); // Should be 64 hex characters
      expect(result.length).toBe(64);
    });

    it('should return lowercase hex string', () => {
      const result = sha256(Buffer.from('test'));
      expect(result).toBe(result.toLowerCase());
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle Unicode strings', () => {
      const result = sha256(Buffer.from('测试', 'utf8'));
      expect(result).toMatch(/^[0-9a-f]{64}$/);
      expect(result.length).toBe(64);
    });
  });
});

