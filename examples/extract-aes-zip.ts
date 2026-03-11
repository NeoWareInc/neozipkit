#!/usr/bin/env node

/**
 * Test AES-256 Encrypted ZIP Example
 * 
 * Validates an AES-256 encrypted ZIP archive by decrypting each entry
 * and verifying HMAC-SHA1 authentication and CRC-32 integrity.
 * No files are extracted to disk.
 *
 * Expects the archive created by create-aes-zip.ts.
 */

import ZipkitNode from '../src/node';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const password = 'NeoZipTest2025!';

  console.log('Testing AES-256 encrypted ZIP archive...');
  console.log(`Password: "${password}"\n`);

  const archivePath = path.join(__dirname, 'output', 'aes-example.zip');

  if (!fs.existsSync(archivePath)) {
    console.error(`ZIP file not found: ${archivePath}`);
    console.error('Run create-aes-zip.ts first to create the encrypted archive.');
    process.exit(1);
  }

  console.log(`Archive: ${archivePath}\n`);

  const zip = new ZipkitNode();
  (zip as any).password = password;

  try {
    await zip.loadZipFile(archivePath);
    const entries = zip.getDirectory();
    console.log(`Found ${entries.length} encrypted file(s):\n`);

    let passed = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const encryption = entry.aesVersion > 0 ? `AES-256 AE-${entry.aesVersion}` : 'ZipCrypto';
      const crcHex = entry.crc.toString(16).toUpperCase().padStart(8, '0');

      const result = await zip.testEntry(entry, { skipHashCheck: false });

      console.log(`  PASS: ${entry.filename}  [${encryption}]  CRC-32: ${crcHex}`);
      passed++;
    }

    console.log(`\n${passed}/${entries.length} entries passed (HMAC-SHA1 + CRC-32 verified).`);

  } catch (error) {
    console.error('FAIL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
