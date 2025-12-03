/**
 * Unit tests for compression and decompression
 * Tests DEFLATE and ZSTD compression methods
 */

import Zipkit from '../../../src/core/Zipkit';
import ZipEntry from '../../../src/core/ZipEntry';
import { CMP_METHOD } from '../../../src/core/constants/Headers';
import { CompressOptions } from '../../../src/core/ZipCompress';

describe('Compression and Decompression', () => {
  let zipkit: Zipkit;

  beforeEach(() => {
    zipkit = new Zipkit();
  });

  // Helper function to create a ZIP with compressed entry for extraction testing
  async function createZipWithEntry(
    zipkit: Zipkit,
    filename: string,
    data: Buffer,
    options?: CompressOptions
  ): Promise<ZipEntry> {
    const entry = new ZipEntry(filename, null, false);
    
    // Compress the data
    const compressedData = await zipkit.compressData(entry, data, options);
    
    // Store compressed data in entry
    entry.cmpData = compressedData;
    entry.compressedSize = compressedData.length;
    
    // Create local header + compressed data
    const localHeader = entry.createLocalHdr();
    const fullEntryData = Buffer.concat([localHeader, compressedData]);
    
    // Add entry to ZIP
    (zipkit as any).zipEntries.push(entry);
    
    // Set up the ZIP buffer with the entry data
    (zipkit as any).inBuffer = fullEntryData;
    entry.localHdrOffset = 0;
    
    return entry;
  }

  describe('DEFLATE Compression', () => {
    it('should compress and decompress text data with DEFLATE', async () => {
      const testData = Buffer.from('This is a test string for DEFLATE compression. It contains some repetitive text to test compression efficiency.');
      
      // Create ZIP with entry
      const entry = await createZipWithEntry(zipkit, 'test.txt', testData, {
        level: 6, // Default compression level
        useZstd: false
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.DEFLATED);
      expect(entry.crc).toBeGreaterThan(0);

      // Decompress
      const decompressed = await zipkit.extract(entry, false);
      
      expect(decompressed).not.toBeNull();
      expect(decompressed).toBeInstanceOf(Buffer);
      if (decompressed) {
        expect(decompressed).toEqual(testData);
        expect(decompressed.length).toBe(testData.length);
      }
    });

    it('should compress and decompress binary data with DEFLATE', async () => {
      const testData = Buffer.alloc(1000);
      for (let i = 0; i < 1000; i++) {
        testData[i] = i % 256;
      }
      
      const entry = await createZipWithEntry(zipkit, 'test.bin', testData, {
        level: 6,
        useZstd: false
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.DEFLATED);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle empty data with DEFLATE', async () => {
      const testData = Buffer.alloc(0);
      const entry = await createZipWithEntry(zipkit, 'empty.txt', testData, {
        level: 6,
        useZstd: false
      });

      // Empty data may be stored or deflated, but should decompress correctly
      expect([CMP_METHOD.STORED, CMP_METHOD.DEFLATED]).toContain(entry.cmpMethod);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).not.toBeNull();
      if (decompressed) {
        expect(decompressed.length).toBe(0);
      }
    });

    it('should handle very small data with DEFLATE', async () => {
      const testData = Buffer.from('Hi');
      const entry = await createZipWithEntry(zipkit, 'small.txt', testData, {
        level: 6,
        useZstd: false
      });

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle large data with DEFLATE', async () => {
      // Create 1MB of repetitive data (should compress well)
      const pattern = Buffer.from('This is a repetitive pattern. '.repeat(100));
      const testData = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < testData.length; i += pattern.length) {
        pattern.copy(testData, i, 0, Math.min(pattern.length, testData.length - i));
      }
      
      const entry = await createZipWithEntry(zipkit, 'large.txt', testData, {
        level: 6,
        useZstd: false
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.DEFLATED);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle different compression levels with DEFLATE', async () => {
      const testData = Buffer.from('This is test data for compression level testing. '.repeat(100));
      
      // Test different compression levels
      for (const level of [1, 6, 9]) {
        const zipkitInstance = new Zipkit();
        const entry = await createZipWithEntry(zipkitInstance, 'test.txt', testData, {
          level,
          useZstd: false
        });

        expect(entry.cmpMethod).toBe(CMP_METHOD.DEFLATED);
        
        const decompressed = await zipkitInstance.extract(entry, false);
        expect(decompressed).toEqual(testData);
      }
    });

    it('should verify CRC-32 after DEFLATE compression and decompression', async () => {
      const testData = Buffer.from('Test data for CRC verification');
      const entry = await createZipWithEntry(zipkit, 'test.txt', testData, {
        level: 6,
        useZstd: false
      });

      expect(entry.crc).toBeGreaterThan(0);
      
      const decompressed = await zipkit.extract(entry, false);
      
      // CRC should match
      const isValid = zipkit.testCRC32(entry, decompressed!);
      expect(isValid).toBe(true);
    });
  });

  describe('ZSTD Compression', () => {
    it('should compress and decompress text data with ZSTD', async () => {
      const testData = Buffer.from('This is a test string for ZSTD compression. It contains some repetitive text to test compression efficiency.');
      
      // Compress with ZSTD
      const entry = await createZipWithEntry(zipkit, 'test.txt', testData, {
        level: 3, // ZSTD compression level
        useZstd: true
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.ZSTD);
      expect(entry.crc).toBeGreaterThan(0);

      // Decompress
      const decompressed = await zipkit.extract(entry, false);
      
      expect(decompressed).toBeInstanceOf(Buffer);
      expect(decompressed).toEqual(testData);
      expect(decompressed!.length).toBe(testData.length);
    });

    it('should compress and decompress binary data with ZSTD', async () => {
      const testData = Buffer.alloc(1000);
      for (let i = 0; i < 1000; i++) {
        testData[i] = i % 256;
      }
      
      const entry = await createZipWithEntry(zipkit, 'test.bin', testData, {
        level: 3,
        useZstd: true
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.ZSTD);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should fallback to STORED for small files with ZSTD', async () => {
      // ZSTD falls back to STORED for files < 100 bytes
      const testData = Buffer.from('Small file');
      const entry = await createZipWithEntry(zipkit, 'small.txt', testData, {
        level: 3,
        useZstd: true
      });

      // Should fallback to STORED for small files
      expect(entry.cmpMethod).toBe(CMP_METHOD.STORED);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle large data with ZSTD', async () => {
      // Create 1MB of repetitive data
      const pattern = Buffer.from('This is a repetitive pattern for ZSTD. '.repeat(100));
      const testData = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < testData.length; i += pattern.length) {
        pattern.copy(testData, i, 0, Math.min(pattern.length, testData.length - i));
      }
      
      const entry = await createZipWithEntry(zipkit, 'large.txt', testData, {
        level: 3,
        useZstd: true
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.ZSTD);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle different compression levels with ZSTD', async () => {
      const testData = Buffer.from('This is test data for ZSTD compression level testing. '.repeat(100));
      
      // Test different compression levels
      for (const level of [1, 3, 6]) {
        const zipkitInstance = new Zipkit();
        const entry = await createZipWithEntry(zipkitInstance, 'test.txt', testData, {
          level,
          useZstd: true
        });

        expect(entry.cmpMethod).toBe(CMP_METHOD.ZSTD);
        
        const decompressed = await zipkitInstance.extract(entry, false);
        expect(decompressed).toEqual(testData);
      }
    });

    it('should verify CRC-32 after ZSTD compression and decompression', async () => {
      const testData = Buffer.from('Test data for CRC verification with ZSTD');
      const entry = await createZipWithEntry(zipkit, 'test.txt', testData, {
        level: 3,
        useZstd: true
      });

      expect(entry.crc).toBeGreaterThan(0);
      
      const decompressed = await zipkit.extract(entry, false);
      
      // CRC should match
      const isValid = zipkit.testCRC32(entry, decompressed!);
      expect(isValid).toBe(true);
    });
  });

  describe('Round-trip Compression Tests', () => {
    it('should round-trip compress and decompress with DEFLATE', async () => {
      const testCases = [
        Buffer.from('Simple text'),
        Buffer.from('Text with special characters: !@#$%^&*()_+-=[]{}|;:,.<>?'),
        Buffer.from('Unicode test: 测试 🚀 émoji'),
        Buffer.alloc(100, 0x41), // 100 'A' characters
        Buffer.alloc(1000, 0x00), // 1000 null bytes
      ];

      for (const testData of testCases) {
        const zipkitInstance = new Zipkit();
        const entry = await createZipWithEntry(zipkitInstance, 'test.txt', testData, {
          level: 6,
          useZstd: false
        });

        const decompressed = await zipkitInstance.extract(entry, false);
        expect(decompressed).toEqual(testData);
      }
    });

    it('should round-trip compress and decompress with ZSTD', async () => {
      const testCases = [
        Buffer.from('Simple text for ZSTD'),
        Buffer.from('Text with special characters: !@#$%^&*()_+-=[]{}|;:,.<>?'),
        Buffer.from('Unicode test: 测试 🚀 émoji'),
        Buffer.alloc(200, 0x41), // 200 'A' characters (ZSTD needs > 100 bytes)
        Buffer.alloc(1000, 0x00), // 1000 null bytes
      ];

      for (const testData of testCases) {
        const zipkitInstance = new Zipkit();
        const entry = await createZipWithEntry(zipkitInstance, 'test.txt', testData, {
          level: 3,
          useZstd: true
        });

        const decompressed = await zipkitInstance.extract(entry, false);
        expect(decompressed).toEqual(testData);
      }
    });

    it('should handle already compressed data (should not compress further)', async () => {
      // Create random data that doesn't compress well
      const testData = Buffer.alloc(1000);
      for (let i = 0; i < 1000; i++) {
        testData[i] = Math.floor(Math.random() * 256);
      }
      
      const entry = await createZipWithEntry(zipkit, 'random.bin', testData, {
        level: 6,
        useZstd: false
      });

      // Random data may not compress much, but should still work
      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });
  });

  describe('Compression Method Comparison', () => {
    it('should compress same data with both DEFLATE and ZSTD', async () => {
      const testData = Buffer.from('This is test data for comparing DEFLATE and ZSTD compression methods. '.repeat(50));
      
      // DEFLATE
      const zipkitDeflate = new Zipkit();
      const entryDeflate = await createZipWithEntry(zipkitDeflate, 'test-deflate.txt', testData, {
        level: 6,
        useZstd: false
      });

      // ZSTD
      const zipkitZstd = new Zipkit();
      const entryZstd = await createZipWithEntry(zipkitZstd, 'test-zstd.txt', testData, {
        level: 3,
        useZstd: true
      });

      expect(entryDeflate.cmpMethod).toBe(CMP_METHOD.DEFLATED);
      expect(entryZstd.cmpMethod).toBe(CMP_METHOD.ZSTD);

      // Both should decompress correctly
      const decompressedDeflate = await zipkitDeflate.extract(entryDeflate, false);
      const decompressedZstd = await zipkitZstd.extract(entryZstd, false);
      
      expect(decompressedDeflate).toEqual(testData);
      expect(decompressedZstd).toEqual(testData);
    });
  });

  describe('Edge Cases', () => {
    it('should handle STORED method (no compression)', async () => {
      const testData = Buffer.from('Test data');
      const entry = await createZipWithEntry(zipkit, 'test.txt', testData, {
        level: 0, // STORED
        useZstd: false
      });

      expect(entry.cmpMethod).toBe(CMP_METHOD.STORED);

      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });

    it('should handle data that expands when compressed', async () => {
      // Very small or already compressed data might expand
      const testData = Buffer.from('AB'); // Very small, might expand
      const entry = await createZipWithEntry(zipkit, 'small.txt', testData, {
        level: 6,
        useZstd: false
      });

      // Should still decompress correctly even if it expanded
      const decompressed = await zipkit.extract(entry, false);
      expect(decompressed).toEqual(testData);
    });
  });
});

