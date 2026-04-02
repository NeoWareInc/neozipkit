#!/usr/bin/env node

/**
 * List ZIP Example
 * 
 * Demonstrates listing ZIP archive contents using ZipkitNode.
 * This is a minimal example showing how to read ZIP metadata.
 */

import ZipkitNode from '../src/node';
import type ZipEntry from '../src/core/ZipEntry';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Listing ZIP archive contents...\n');

  // Example: Use the ZIP file created by create-zip.ts
  // You can also specify your own ZIP file path here
  const archivePath = path.join(__dirname, 'output', 'example.zip');

  // Check if ZIP file exists
  if (!fs.existsSync(archivePath)) {
    console.error(`❌ ZIP file not found: ${archivePath}`);
    console.error('💡 Tip: Run create-zip.ts first to create a test ZIP file,');
    console.error('   or modify archivePath to point to your own ZIP file.');
    process.exit(1);
  }

  // Get file stats
  const stats = fs.statSync(archivePath);
  console.log(`Archive: ${archivePath}`);
  console.log(`Size: ${stats.size} bytes\n`);

  // Create ZipkitNode instance
  const zip = new ZipkitNode();

  try {
    // Load the ZIP file
    console.log('Loading ZIP file...');
    const entries = await zip.loadZipFile(archivePath);

    console.log(`✅ ZIP file loaded successfully\n`);
    console.log(`Total entries: ${entries.length}\n`);

    if (entries.length === 0) {
      console.log('Archive is empty.');
      return;
    }

    // Display entries in a table format
    console.log('─'.repeat(80));
    console.log(
      padRight('Filename', 30) +
      padLeft('Original', 10) +
      padLeft('Compressed', 12) +
      padLeft('Ratio', 10) +
      '   ' +
      padRight('Method', 10)
    );
    console.log('─'.repeat(80));

    let totalSize = 0;
    let totalCompressed = 0;

    entries.forEach((entry: ZipEntry) => {
      const filename = entry.filename || '(unnamed)';
      const size = entry.uncompressedSize || 0;
      const compressed = entry.compressedSize || 0;
      const method = entry.cmpMethodToString();
      const ratio = size > 0 ? ((1 - compressed / size) * 100).toFixed(1) : '0.0';

      totalSize += size;
      totalCompressed += compressed;

      console.log(
        padRight(filename.length > 28 ? filename.substring(0, 25) + '...' : filename, 30) +
        padLeft(formatBytes(size), 10) +
        padLeft(formatBytes(compressed), 12) +
        padLeft(ratio + '%', 10) +
        '   ' +
        padRight(method, 10)
      );
    });

    console.log('─'.repeat(80));
    const totalRatio = totalSize > 0 ? ((1 - totalCompressed / totalSize) * 100).toFixed(1) : '0.0';
    console.log(
      padRight('Total', 30) +
      padLeft(formatBytes(totalSize), 10) +
      padLeft(formatBytes(totalCompressed), 12) +
      padLeft(totalRatio + '%', 10) +
      '   ' +
      padRight('', 10)
    );
    console.log('─'.repeat(80));

    // Display additional information
    console.log('\nAdditional Information:');
    console.log(`  Archive comment: ${zip.getZipComment() || '(none)'}`);
    
    // Show compression methods used
    const methods = new Set(entries.map((e: ZipEntry) => e.cmpMethodToString()));
    console.log(`  Compression methods: ${Array.from(methods).join(', ')}`);

    // Show entries with SHA-256 hashes (for blockchain features)
    const entriesWithHash = entries.filter((e: ZipEntry) => (e as any).sha256);
    if (entriesWithHash.length > 0) {
      console.log(`  Entries with SHA-256: ${entriesWithHash.length}`);
    }

    console.log('\n💡 Tip: You can access individual entry properties:');
    console.log('   entry.filename - File name');
    console.log('   entry.uncompressedSize - Original file size');
    console.log('   entry.compressedSize - Compressed size');
    console.log('   entry.cmpMethod - Compression method code');
    console.log('   entry.crc - CRC-32 checksum');
    console.log('   entry.timeDateDOS - File timestamp');

  } catch (error) {
    console.error('❌ Error reading ZIP archive:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

/**
 * Helper function to pad string to the right
 */
function padRight(str: string, length: number): string {
  return (str + ' '.repeat(length)).slice(0, length);
}

/**
 * Helper function to pad string to the left
 */
function padLeft(str: string, length: number): string {
  return (' '.repeat(length) + str).slice(-length);
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

