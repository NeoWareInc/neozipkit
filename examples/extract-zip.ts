#!/usr/bin/env node

/**
 * Extract ZIP Example
 * 
 * Demonstrates extracting files from a ZIP archive using ZipkitNode.
 * This is a minimal example showing the basic extraction API.
 * 
 * Note: CRC-32 and SHA-256 validation happens automatically during extraction.
 * If extraction completes without errors, all files have been validated.
 */

import ZipkitNode from '../src/node';
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
    // Load ZIP file - this reads the central directory and populates entries
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

    // Option: Test mode - validate integrity without extracting files
    // Uncomment the following lines to test without extracting:
    /*
    console.log('Testing ZIP integrity (without extracting)...');
    for (const entry of entries) {
      const testResult = await zip.testEntry(entry, {
        skipHashCheck: false  // Verify file integrity (CRC-32/SHA-256 checks)
      });
      console.log(`✅ ${entry.filename}: Validated`);
      if (testResult.verifiedHash) {
        console.log(`   Verified SHA-256: ${testResult.verifiedHash}`);
      } else {
        console.log(`   Verified CRC-32: ${entry.crc?.toString(16).toUpperCase().padStart(8, '0')}`);
      }
    }
    console.log(`✅ All files validated successfully!`);
    return;
    */

    // Extract all files to destination directory
    // CRC-32 and SHA-256 validation happens automatically during extraction
    // If extraction completes without errors, all files have been validated
    console.log('Extracting files...');
    const result = await zip.extractZipFile(archivePath, destination, {
      overwrite: true,        // Overwrite existing files
      preserveTimestamps: true, // Preserve file timestamps
      skipHashCheck: false    // Verify file integrity (CRC-32/SHA-256 checks)
      // Note: skipHashCheck: false is the default - validation happens automatically
    });

    console.log(`✅ Extraction completed successfully!`);
    console.log(`   Files extracted: ${result.filesExtracted}`);
    console.log(`   Total bytes: ${result.bytesExtracted}`);
    console.log(`\n   All files validated (CRC-32/SHA-256 checks passed automatically)`);

    console.log('\n💡 Tip: You can also extract individual entries:');
    console.log('   await zip.loadZipFile("archive.zip");');
    console.log('   const entries = zip.getDirectory();');
    console.log('   await zip.extractToFile(entries[0], "output.txt");');
    console.log('\n💡 Tip: Test integrity without extracting:');
    console.log('   const result = await zip.testEntry(entry);');
    console.log('   if (result.verifiedHash) {');
    console.log('     console.log("SHA-256:", result.verifiedHash);');
    console.log('   }');

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

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

