#!/usr/bin/env node

/**
 * NeoEncrypt (NeoCrypto) AES-256 — create and verify in one run.
 *
 * Uses encryptionMethod: 'neo-aes256' (NEO extra field 0x024E). Third-party
 * unzip tools may not recognize this format; use NeoZipKit to extract.
 *
 * Output: examples/output/neo-aes-example.zip
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import * as fs from 'fs';
import * as path from 'path';

const PASSWORD = 'NeoZipTest2026!';
const OUTPUT = path.join(__dirname, 'output', 'neo-aes-example.zip');

async function main() {
  console.log('NeoEncrypt (NEO AES-256) — create + verify\n');
  console.log(`Password: "${PASSWORD}"\n`);

  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
  ];

  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      console.error(`Missing test file: ${file}`);
      process.exit(1);
    }
  }

  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const options: CompressOptions = {
    level: 6,
    useZstd: false,
    useSHA256: false,
    password: PASSWORD,
    encryptionMethod: 'neo-aes256',
  };

  console.log('Creating archive...');
  const zip = new ZipkitNode();
  await zip.createZipFromFiles(testFiles, OUTPUT, options);
  console.log(`Wrote ${OUTPUT}\n`);

  console.log('Verifying entries (CRC + HMAC)...');
  const zip2 = new ZipkitNode();
  (zip2 as any).password = PASSWORD;
  await zip2.loadZipFile(OUTPUT);
  const entries = zip2.getDirectory().filter((e) => !e.isDirectory);

  for (const entry of entries) {
    if (entry.neoCryptoAlgorithm <= 0) {
      throw new Error(`Expected NeoEncrypt extra on ${entry.filename}`);
    }
    await zip2.testEntry(entry, { skipHashCheck: false });
    console.log(`  OK: ${entry.filename} (neo algorithm ${entry.neoCryptoAlgorithm})`);
  }

  console.log('\nAll entries verified.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
