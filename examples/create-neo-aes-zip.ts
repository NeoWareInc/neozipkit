#!/usr/bin/env node

/**
 * Create NeoEncrypt (NEO AES-256) ZIP example
 *
 * Uses encryptionMethod: 'neo-aes256': standard ZIP compression method in the
 * local/central header plus NEO crypto extra field 0x024E (see docs/NEO_CRYPTO_FORMAT.md).
 * Third-party unzip tools may not recognize this format; use NeoZipKit to extract.
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const password = 'NeoZipTest2025!';

  console.log('Creating NeoEncrypt (NEO AES-256) ZIP archive...');
  console.log(`Password: "${password}"\n`);

  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
  ];

  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      console.error(`Error: Test file not found: ${file}`);
      process.exit(1);
    }
  }

  const zip = new ZipkitNode();
  const outputZip = path.join(__dirname, 'output', 'neo-aes-example.zip');
  const outputDir = path.dirname(outputZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const options: CompressOptions = {
    level: 6,
    useZstd: false,
    useSHA256: false,
    password,
    encryptionMethod: 'neo-aes256',
  };

  await zip.createZipFromFiles(testFiles, outputZip, options);
  console.log(`Wrote ${outputZip}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
