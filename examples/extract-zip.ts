#!/usr/bin/env node

/**
 * Extract ZIP Example
 * 
 * Demonstrates extracting files from a ZIP archive using ZipkitNode.
 * This is a minimal example showing the basic extraction API.
 */

import ZipkitNode from '../src/node';
import { crc32 } from '../src/core/encryption/ZipCrypto';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Extracting ZIP archive example...\n');

  // Example: Use the ZIP file created by create-zip.ts
  // You can also specify your own ZIP file path here
  const archivePath = path.join(__dirname, 'output', 'example.zip');
  const destination = path.join(__dirname, 'extracted');

  // Check if ZIP file exists
  if (!fs.existsSync(archivePath)) {
    console.error(`❌ ZIP file not found: ${archivePath}`);
    console.error('💡 Tip: Run create-zip.ts first to create a test ZIP file,');
    console.error('   or modify archivePath to point to your own ZIP file.');
    process.exit(1);
  }

  console.log(`Archive: ${archivePath}`);
  console.log(`Destination: ${destination}\n`);

  // Create ZipkitNode instance
  const zip = new ZipkitNode();

  try {
    // Method 1: Simple API - extract entire ZIP to directory
    // This is the easiest way to extract a ZIP file
    console.log('Loading ZIP file...');
    await zip.loadZipFile(archivePath);

    // Get directory listing to show what will be extracted
    const entries = zip.getDirectory();
    console.log(`Found ${entries.length} file(s) in archive:\n`);
    
    entries.forEach((entry, index) => {
      const size = entry.uncompressedSize || 0;
      const compressed = entry.compressedSize || 0;
      const method = entry.cmpMethodToString();
      console.log(`  ${index + 1}. ${entry.filename}`);
      console.log(`     Size: ${size} bytes (compressed: ${compressed} bytes, ${method})`);
    });
    console.log();

    // Extract all files to destination directory
    console.log('Extracting files...');
    const result = await zip.extractZipFile(archivePath, destination, {
      overwrite: true,        // Overwrite existing files
      preserveTimestamps: true, // Preserve file timestamps
      skipHashCheck: false    // Verify file integrity (CRC/SHA checks)
    });

    console.log(`✅ Extraction completed successfully!`);
    console.log(`   Files extracted: ${result.filesExtracted}`);
    console.log(`   Total bytes: ${result.bytesExtracted}`);

    // Verify CRC-32 for each extracted file
    console.log('\nCRC-32 Verification:');
    const extractedFiles = getAllFiles(destination);
    let allCrcMatch = true;
    
    // Create a map of filename to entry for quick lookup
    const entryMap = new Map<string, typeof entries[0]>();
    entries.forEach(entry => {
      const filename = path.basename(entry.filename);
      entryMap.set(filename, entry);
    });
    
    extractedFiles.forEach(file => {
      const relativePath = path.relative(destination, file);
      const filename = path.basename(file);
      const stats = fs.statSync(file);
      const entry = entryMap.get(filename);
      
      if (entry) {
        const storedCrc = entry.crc || 0;
        const storedCrcHex = `0x${storedCrc.toString(16).padStart(8, '0').toUpperCase()}`;
        
        // Calculate CRC-32 of extracted file
        const fileData = fs.readFileSync(file);
        const calculatedCrc = crc32(fileData);
        const calculatedCrcHex = `0x${calculatedCrc.toString(16).padStart(8, '0').toUpperCase()}`;
        
        // Compare CRC-32 values
        const crcMatch = storedCrc === calculatedCrc;
        const status = crcMatch ? '✓' : '✗';
        const statusText = crcMatch ? 'PASS' : 'FAILED';
        
        if (!crcMatch) {
          allCrcMatch = false;
        }
        
        console.log(`  ${filename}:`);
        console.log(`    Stored CRC-32:   ${storedCrcHex}`);
        console.log(`    Calculated CRC-32: ${calculatedCrcHex}`);
        console.log(`    Status: ${status} ${statusText}`);
      } else {
        console.log(`  ${filename}: Entry not found in ZIP`);
      }
    });
    
    if (allCrcMatch) {
      console.log('\n✅ All CRC-32 checks passed!');
    } else {
      console.log('\n❌ Some CRC-32 checks failed!');
    }

    console.log('\n💡 Tip: You can also extract individual entries:');
    console.log('   await zip.loadZipFile("archive.zip");');
    console.log('   const entries = zip.getDirectory();');
    console.log('   await zip.extractToFile(entries[0], "output.txt");');

  } catch (error) {
    console.error('❌ Error extracting ZIP archive:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Helper function to recursively get all files in a directory
 */
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

