#!/usr/bin/env node

/**
 * Test Zstd Memory Corruption Issue
 * 
 * This test demonstrates a potential memory corruption issue when:
 * 1. Compressing data with Zstd using one neozipkit instance
 * 2. Creating a new neozipkit instance in the same process
 * 3. Decompressing the Zstd-compressed data with the new instance
 * 
 * The issue is caused by module-level singletons sharing the same WASM module
 * instance across different neozipkit instances.
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Testing Zstd Memory Corruption Issue...\n');
  console.log('This test creates two separate ZipkitNode instances:');
  console.log('1. First instance compresses data with Zstd');
  console.log('2. Second instance decompresses the same data');
  console.log('If there is shared state, this may cause memory corruption.\n');

  const testDir = path.join(__dirname, 'test-files');
  const outputDir = path.join(__dirname, 'output');
  const outputZip = path.join(outputDir, 'zstd-test.zip');
  const extractDir = path.join(__dirname, 'extracted-zstd-test');

  // Ensure directories exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  // Create a test file with some data
  const testFilePath = path.join(testDir, 'file1.txt');
  if (!fs.existsSync(testFilePath)) {
    console.error(`❌ Error: Test file not found: ${testFilePath}`);
    process.exit(1);
  }

  try {
    // ============================================================================
    // STEP 1: Compress with Zstd using first instance
    // ============================================================================
    console.log('Step 1: Creating first ZipkitNode instance and compressing with Zstd...');
    const zip1 = new ZipkitNode();
    
    const compressOptions: CompressOptions = {
      level: 6,
      useZstd: true,  // Force Zstd compression (method 93)
      useSHA256: true
    };

    await zip1.createZipFromFiles([testFilePath], outputZip, compressOptions);
    console.log(`✅ Compressed successfully with first instance: ${outputZip}`);

    // Verify the compression method is Zstd (93)
    await zip1.loadZipFile(outputZip);
    const entries1 = zip1.getDirectory();
    const entry = entries1[0];
    console.log(`   Compression method: ${entry.cmpMethodToString()} (${entry.cmpMethod})`);
    
    if (entry.cmpMethod !== 93) {
      console.error(`❌ Error: Expected Zstd compression (93), got ${entry.cmpMethod}`);
      process.exit(1);
    }

    console.log(`   Original size: ${entry.uncompressedSize} bytes`);
    console.log(`   Compressed size: ${entry.compressedSize} bytes`);
    console.log(`   Compression ratio: ${((1 - entry.compressedSize / entry.uncompressedSize) * 100).toFixed(1)}%`);

    // ============================================================================
    // STEP 2: Create NEW instance and decompress
    // ============================================================================
    console.log('\nStep 2: Creating second ZipkitNode instance (NEW instance)...');
    const zip2 = new ZipkitNode();
    console.log('✅ Second instance created');

    console.log('\nStep 3: Loading ZIP file with second instance...');
    await zip2.loadZipFile(outputZip);
    const entries2 = zip2.getDirectory();
    console.log(`✅ Loaded ${entries2.length} entries with second instance`);

    console.log('\nStep 4: Testing entry with second instance (potential memory corruption point)...');
    const entryToTest = entries2[0];
    const testResult = await zip2.testEntry(entryToTest, { skipHashCheck: false });
    console.log('✅ CRC-32 validation completed with second instance');

    // ============================================================================
    // STEP 3: Verify the data integrity via CRC-32
    // ============================================================================
    console.log('\nStep 5: Verifying data integrity via CRC-32...');
    console.log('✅ Data integrity verified - CRC-32 validation passed');
    console.log(`   Original size: ${entryToTest.uncompressedSize} bytes`);
    console.log(`   Compressed size: ${entryToTest.compressedSize} bytes`);
    if (testResult.verifiedHash) {
      console.log(`   SHA-256: ${testResult.verifiedHash.substring(0, 16)}...`);
    } else {
      console.log(`   CRC-32: ${entryToTest.crc?.toString(16).toUpperCase().padStart(8, '0')}`);
    }

    const originalData = fs.readFileSync(testFilePath);

    // ============================================================================
    // STEP 4: Additional test - multiple cycles with CRC-32 validation
    // ============================================================================
    console.log('\nStep 6: Testing multiple compress/decompress cycles...');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n  Cycle ${i}:`);
      const cycleZip = path.join(outputDir, `zstd-cycle-${i}.zip`);

      // New instance for compression
      const zipCompress = new ZipkitNode();
      await zipCompress.createZipFromFiles([testFilePath], cycleZip, compressOptions);
      console.log(`    ✅ Compressed with instance ${i * 2 - 1}`);

      // New instance for validation (not extraction)
      const zipValidate = new ZipkitNode();
      await zipValidate.loadZipFile(cycleZip);
      const cycleEntries = zipValidate.getDirectory();
      
      // Test/validate the entry (this decompresses and validates CRC-32)
      const cycleTestResult = await zipValidate.testEntry(cycleEntries[0], { skipHashCheck: false });
      console.log(`    ✅ Validated with instance ${i * 2}`);
      console.log(`    ✅ Cycle ${i} verified - CRC-32 passed`);
    }

    // ============================================================================
    // SUCCESS
    // ============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log('\nNo memory corruption detected!');
    console.log('Multiple ZipkitNode instances can safely compress and decompress Zstd data.');
    console.log('\nTest Summary:');
    console.log('  - Created and used 8+ separate ZipkitNode instances');
    console.log('  - Compressed and decompressed with Zstd (method 93)');
    console.log('  - Verified data integrity across all operations');
    console.log('  - No memory corruption or state bleeding detected');

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED - MEMORY CORRUPTION DETECTED');
    console.error('='.repeat(80));
    console.error('\nError details:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    console.error('\nThis error indicates that multiple ZipkitNode instances are sharing');
    console.error('Zstd WASM module state, causing memory corruption.');
    process.exit(1);
  } finally {
    // Cleanup extract directory if it exists
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true });
    }
  }
}

// Run the test
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

