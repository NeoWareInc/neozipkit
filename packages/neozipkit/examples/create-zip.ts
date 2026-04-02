#!/usr/bin/env node

/**
 * Create ZIP Example
 * 
 * Demonstrates creating a ZIP archive from multiple files using ZipkitNode.
 * This is a minimal example showing the basic API usage.
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  console.log('Creating ZIP archive example...\n');

  // Test files to compress (located in test-files directory)
  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
    path.join(testDir, 'document.md'),
    path.join(testDir, 'data.json')
  ];

  // Verify all test files exist
  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      console.error(`❌ Error: Test file not found: ${file}`);
      console.error('   Make sure test-files directory contains the required files.');
      process.exit(1);
    }
  }

  console.log('Source files:');
  testFiles.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${stats.size} bytes)`);
  });
  console.log();

  // Create ZipkitNode instance
  const zip = new ZipkitNode();

  // Define output ZIP file path
  const outputZip = path.join(__dirname, 'output', 'example.zip');

  // Ensure output directory exists
  const outputDir = path.dirname(outputZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Compression options
  const options: CompressOptions = {
    level: 6,        // Compression level (0-9, higher = better compression but slower)
    useZstd: false,  // Use Deflate compression (standard ZIP)
    useSHA256: false // Don't calculate SHA-256 hashes (faster, but needed for blockchain features)
  };

  try {
    console.log('Creating ZIP archive...');
    
    // Method 1: Simple API - create ZIP from file paths
    // This is the easiest way to create a ZIP file
    await zip.createZipFromFiles(testFiles, outputZip, options);

    console.log(`✅ ZIP archive created successfully: ${outputZip}\n`);

    // Load the ZIP to get entry details
    await zip.loadZipFile(outputZip);
    const entries = zip.getDirectory();

    // Display summary of compressed files
    console.log('Compression Summary:');
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

    let totalOriginal = 0;
    let totalCompressed = 0;

    entries.forEach((entry) => {
      const filename = entry.filename || '(unnamed)';
      const original = entry.uncompressedSize || 0;
      const compressed = entry.compressedSize || 0;
      const ratio = original > 0 ? ((1 - compressed / original) * 100).toFixed(1) : '0.0';
      const method = entry.cmpMethodToString();

      totalOriginal += original;
      totalCompressed += compressed;

      console.log(
        padRight(filename.length > 28 ? filename.substring(0, 25) + '...' : filename, 30) +
        padLeft(formatBytes(original), 10) +
        padLeft(formatBytes(compressed), 12) +
        padLeft(ratio + '%', 10) +
        '   ' +
        padRight(method, 10)
      );
    });

    console.log('─'.repeat(80));
    const totalRatio = totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : '0.0';
    console.log(
      padRight('Total', 30) +
      padLeft(formatBytes(totalOriginal), 10) +
      padLeft(formatBytes(totalCompressed), 12) +
      padLeft(totalRatio + '%', 10) +
      '   ' +
      padRight('', 10)
    );
    console.log('─'.repeat(80));

    // Verify the ZIP was created
    if (fs.existsSync(outputZip)) {
      const zipStats = fs.statSync(outputZip);
      console.log(`\nArchive file size: ${formatBytes(zipStats.size)}`);
    }

    console.log('\n💡 Tip: You can also use addFileToZip() for more control:');
    console.log('   const zip = new ZipkitNode();');
    console.log('   await zip.addFileToZip("file.txt", "file.txt", options);');
    console.log('   // ... add more files ...');
    console.log('   // Then manually write ZIP structure');

  } catch (error) {
    console.error('❌ Error creating ZIP archive:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

