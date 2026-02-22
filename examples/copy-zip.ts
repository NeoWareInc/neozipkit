#!/usr/bin/env node

/**
 * Copy ZIP Example
 * 
 * Demonstrates copying entries from an existing ZIP file to a new ZIP file
 * using the ZipCopyNode class. This preserves all original properties
 * (compression, timestamps, etc.) without decompression/recompression.
 */

import { ZipCopyNode, ZipkitNode } from '../src/node';
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
  console.log('Copy ZIP file example...\n');

  // Source ZIP file (use the example.zip created by create-zip.ts if it exists)
  const sourceZip = path.join(__dirname, 'output', 'example.zip');
  
  // If example.zip doesn't exist, check for any ZIP file in the output directory
  let actualSourceZip = sourceZip;
  if (!fs.existsSync(sourceZip)) {
    const outputDir = path.dirname(sourceZip);
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.zip'));
      if (files.length > 0) {
        actualSourceZip = path.join(outputDir, files[0]);
        console.log(`⚠️  example.zip not found, using: ${files[0]}\n`);
      }
    }
  }

  // Verify source ZIP exists
  if (!fs.existsSync(actualSourceZip)) {
    console.error(`❌ Error: Source ZIP file not found: ${actualSourceZip}`);
    console.error('   Please run create-zip.ts first to create a ZIP file, or');
    console.error('   update the sourceZip path in this example to point to an existing ZIP file.');
    process.exit(1);
  }

  const sourceStats = fs.statSync(actualSourceZip);
  console.log(`Source ZIP: ${path.basename(actualSourceZip)}`);
  console.log(`  Size: ${formatBytes(sourceStats.size)}`);
  console.log();

  // Destination ZIP file
  const destZip = path.join(__dirname, 'output', 'copied.zip');

  // Ensure output directory exists
  const outputDir = path.dirname(destZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('Copying ZIP entries...');
    
    // Create ZipCopyNode instance
    const zipkitNode = new ZipkitNode();
    const zipCopy = new ZipCopyNode(zipkitNode);
    
    // Option 1: Copy all entries
    console.log('  Copying all entries from source to destination...');
    const result = await zipCopy.copyZipFile(actualSourceZip, destZip);

    console.log(`✅ ZIP file copied successfully: ${destZip}\n`);

    // Display summary of copied entries
    console.log('Copied Entries Summary:');
    console.log('─'.repeat(80));
    console.log(
      padRight('Filename', 50) +
      padLeft('Compressed Size', 20) +
      padLeft('Local Header Offset', 20)
    );
    console.log('─'.repeat(80));

    result.entries.forEach((entry) => {
      const filename = entry.filename || '(unnamed)';
      console.log(
        padRight(filename.length > 48 ? filename.substring(0, 45) + '...' : filename, 50) +
        padLeft(formatBytes(entry.compressedSize), 20) +
        padLeft(`0x${entry.localHeaderOffset.toString(16)}`, 20)
      );
    });

    console.log('─'.repeat(80));
    console.log(`Total entries copied: ${result.totalEntries}`);
    console.log(`Central directory offset: 0x${result.centralDirOffset.toString(16)}`);

    // Verify the copied ZIP was created
    if (fs.existsSync(destZip)) {
      const destStats = fs.statSync(destZip);
      console.log(`\nDestination ZIP file size: ${formatBytes(destStats.size)}`);
      
      // Compare sizes (they should be very similar, possibly identical)
      const sizeDiff = Math.abs(sourceStats.size - destStats.size);
      if (sizeDiff === 0) {
        console.log('✅ File sizes match exactly - perfect copy!');
      } else {
        console.log(`ℹ️  Size difference: ${formatBytes(sizeDiff)} (expected due to ZIP structure variations)`);
      }
    }

    console.log('\n💡 Tip: You can also filter entries during copy:');
    console.log('   const zipCopy = new ZipCopyNode(new ZipkitNode());');
    console.log('   await zipCopy.copyZipFile(sourceZip, destZip, {');
    console.log('     entryFilter: (entry) => entry.filename.endsWith(".txt")');
    console.log('   });');

  } catch (error) {
    console.error('❌ Error copying ZIP file:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
