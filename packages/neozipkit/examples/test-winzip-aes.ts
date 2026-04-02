#!/usr/bin/env node

/**
 * WinZip-compatible AES-256 (AE-1) — create and verify in one run.
 *
 * Archives can be opened with WinZip, 7-Zip, unar, etc.
 * Output: examples/output/aes-example.zip
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import * as fs from 'fs';
import * as path from 'path';

const PASSWORD = 'NeoZipTest2026!';
const OUTPUT = path.join(__dirname, 'output', 'aes-example.zip');

async function main() {
  console.log('WinZip-compatible AES-256 — create + verify\n');
  console.log(`Password: "${PASSWORD}"\n`);

  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
    path.join(testDir, 'document.md'),
    path.join(testDir, 'data.json'),
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
    encryptionMethod: 'aes256',
  };

  console.log('Creating archive (WinZip AE-1)...');
  const zip = new ZipkitNode();
  await zip.createZipFromFiles(testFiles, OUTPUT, options);
  console.log(`Wrote ${OUTPUT}\n`);

  console.log('Verifying entries (HMAC-SHA1 + CRC-32)...');
  const zip2 = new ZipkitNode();
  (zip2 as any).password = PASSWORD;
  await zip2.loadZipFile(OUTPUT);
  const entries = zip2.getDirectory().filter((e) => !e.isDirectory);

  let passed = 0;
  for (const entry of entries) {
    const encryption = entry.aesVersion > 0 ? `AES-256 AE-${entry.aesVersion}` : 'ZipCrypto';
    const crcHex = entry.crc.toString(16).toUpperCase().padStart(8, '0');
    await zip2.testEntry(entry, { skipHashCheck: false });
    console.log(`  PASS: ${entry.filename}  [${encryption}]  CRC-32: ${crcHex}`);
    passed++;
  }

  console.log(`\n${passed}/${entries.length} entries passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
