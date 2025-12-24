/**
 * Unit Tests for Zstd Instance Isolation
 * 
 * These tests verify that multiple neozipkit instances can safely use Zstd
 * compression and decompression without memory corruption or shared state issues.
 */

import ZipkitNode from '../../src/node/ZipkitNode';
import { CompressOptions } from '../../src/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Zstd Instance Isolation', () => {
  let tempDir: string;
  let testFile: string;
  let testData: Buffer;

  beforeAll(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zstd-test-'));
    
    // Create test file with some data
    testFile = path.join(tempDir, 'test.txt');
    testData = Buffer.from('This is test data for Zstd compression. '.repeat(100));
    fs.writeFileSync(testFile, testData);
  });

  afterAll(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should compress and decompress with same instance', async () => {
    const zipPath = path.join(tempDir, 'test1.zip');
    const extractDir = path.join(tempDir, 'extract1');
    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new ZipkitNode();
    
    // Compress with Zstd
    await zip.createZipFromFiles([testFile], zipPath, {
      level: 6,
      useZstd: true,
      useSHA256: true
    });

    // Decompress with same instance
    await zip.extractZipFile(zipPath, extractDir);

    // Verify
    const extractedFile = path.join(extractDir, path.basename(testFile));
    const extractedData = fs.readFileSync(extractedFile);
    expect(extractedData.equals(testData)).toBe(true);

    // Cleanup
    fs.rmSync(extractDir, { recursive: true });
  }, 30000);

  test('should compress with one instance and decompress with another', async () => {
    const zipPath = path.join(tempDir, 'test2.zip');
    const extractDir = path.join(tempDir, 'extract2');
    fs.mkdirSync(extractDir, { recursive: true });

    // Compress with first instance
    const zip1 = new ZipkitNode();
    await zip1.createZipFromFiles([testFile], zipPath, {
      level: 6,
      useZstd: true,
      useSHA256: true
    });

    // Decompress with NEW instance
    const zip2 = new ZipkitNode();
    await zip2.extractZipFile(zipPath, extractDir);

    // Verify
    const extractedFile = path.join(extractDir, path.basename(testFile));
    const extractedData = fs.readFileSync(extractedFile);
    expect(extractedData.equals(testData)).toBe(true);

    // Cleanup
    fs.rmSync(extractDir, { recursive: true });
  }, 30000);

  test('should handle multiple sequential instances', async () => {
    for (let i = 0; i < 5; i++) {
      const zipPath = path.join(tempDir, `test-seq-${i}.zip`);
      const extractDir = path.join(tempDir, `extract-seq-${i}`);
      fs.mkdirSync(extractDir, { recursive: true });

      // Create new instance for each iteration
      const zipCompress = new ZipkitNode();
      await zipCompress.createZipFromFiles([testFile], zipPath, {
        level: 6,
        useZstd: true,
        useSHA256: true
      });

      // Create another new instance for decompression
      const zipDecompress = new ZipkitNode();
      await zipDecompress.extractZipFile(zipPath, extractDir);

      // Verify
      const extractedFile = path.join(extractDir, path.basename(testFile));
      const extractedData = fs.readFileSync(extractedFile);
      expect(extractedData.equals(testData)).toBe(true);

      // Cleanup
      fs.rmSync(extractDir, { recursive: true });
    }
  }, 60000);

  test('should handle concurrent instances (parallel operations)', async () => {
    const operations = [];

    for (let i = 0; i < 3; i++) {
      const zipPath = path.join(tempDir, `test-parallel-${i}.zip`);
      const extractDir = path.join(tempDir, `extract-parallel-${i}`);
      
      const operation = (async () => {
        fs.mkdirSync(extractDir, { recursive: true });

        // Compress
        const zipCompress = new ZipkitNode();
        await zipCompress.createZipFromFiles([testFile], zipPath, {
          level: 6,
          useZstd: true,
          useSHA256: true
        });

        // Decompress
        const zipDecompress = new ZipkitNode();
        await zipDecompress.extractZipFile(zipPath, extractDir);

        // Verify
        const extractedFile = path.join(extractDir, path.basename(testFile));
        const extractedData = fs.readFileSync(extractedFile);
        expect(extractedData.equals(testData)).toBe(true);

        // Cleanup
        fs.rmSync(extractDir, { recursive: true });
      })();

      operations.push(operation);
    }

    // Wait for all operations to complete
    await Promise.all(operations);
  }, 60000);

  test('should verify compression method is Zstd (93)', async () => {
    const zipPath = path.join(tempDir, 'test-method.zip');

    const zip = new ZipkitNode();
    await zip.createZipFromFiles([testFile], zipPath, {
      level: 6,
      useZstd: true,
      useSHA256: true
    });

    // Load and check compression method
    await zip.loadZipFile(zipPath);
    const entries = zip.getDirectory();
    expect(entries.length).toBe(1);
    expect(entries[0].cmpMethod).toBe(93); // Zstd method code
    expect(entries[0].cmpMethodToString()).toBe('ZSTD');
  }, 30000);

  test('should handle dispose() method', async () => {
    const zipPath = path.join(tempDir, 'test-dispose.zip');
    const extractDir = path.join(tempDir, 'extract-dispose');
    fs.mkdirSync(extractDir, { recursive: true });

    const zip1 = new ZipkitNode();
    await zip1.createZipFromFiles([testFile], zipPath, {
      level: 6,
      useZstd: true,
      useSHA256: true
    });

    // Dispose should not throw
    expect(() => {
      // Access internal compress/decompress instances if available
      const compressNode = (zip1 as any).compressNode;
      const decompressNode = (zip1 as any).decompressNode;
      
      if (compressNode && typeof compressNode.dispose === 'function') {
        compressNode.dispose();
      }
      if (decompressNode && typeof decompressNode.dispose === 'function') {
        decompressNode.dispose();
      }
    }).not.toThrow();

    // Should still be able to create new instance and decompress
    const zip2 = new ZipkitNode();
    await zip2.extractZipFile(zipPath, extractDir);

    // Verify
    const extractedFile = path.join(extractDir, path.basename(testFile));
    const extractedData = fs.readFileSync(extractedFile);
    expect(extractedData.equals(testData)).toBe(true);

    // Cleanup
    fs.rmSync(extractDir, { recursive: true });
  }, 30000);

  test('should not have memory corruption with large data', async () => {
    // Create larger test file
    const largeTestFile = path.join(tempDir, 'large-test.txt');
    const largeData = Buffer.from('Large test data. '.repeat(10000)); // ~170KB
    fs.writeFileSync(largeTestFile, largeData);

    const zipPath = path.join(tempDir, 'test-large.zip');
    const extractDir = path.join(tempDir, 'extract-large');
    fs.mkdirSync(extractDir, { recursive: true });

    // Compress with first instance
    const zip1 = new ZipkitNode();
    await zip1.createZipFromFiles([largeTestFile], zipPath, {
      level: 6,
      useZstd: true,
      useSHA256: true
    });

    // Decompress with second instance
    const zip2 = new ZipkitNode();
    await zip2.extractZipFile(zipPath, extractDir);

    // Verify
    const extractedFile = path.join(extractDir, path.basename(largeTestFile));
    const extractedData = fs.readFileSync(extractedFile);
    expect(extractedData.equals(largeData)).toBe(true);

    // Cleanup
    fs.rmSync(extractDir, { recursive: true });
    fs.unlinkSync(largeTestFile);
  }, 60000);
});

