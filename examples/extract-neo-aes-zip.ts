#!/usr/bin/env node

/**
 * Verify NeoEncrypt ZIP created by create-neo-aes-zip.ts (CRC + HMAC).
 */

import ZipkitNode from '../src/node';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const password = 'NeoZipTest2025!';
  const archivePath = path.join(__dirname, 'output', 'neo-aes-example.zip');

  if (!fs.existsSync(archivePath)) {
    console.error(`Missing ${archivePath} — run create-neo-aes-zip.ts first.`);
    process.exit(1);
  }

  const zip = new ZipkitNode();
  (zip as any).password = password;

  await zip.loadZipFile(archivePath);
  const entries = zip.getDirectory().filter((e) => !e.isDirectory);

  for (const entry of entries) {
    if (entry.neoCryptoAlgorithm <= 0) {
      throw new Error(`Expected NeoEncrypt extra on ${entry.filename}`);
    }
    await zip.testEntry(entry, { skipHashCheck: false });
    console.log(`OK: ${entry.filename} (neo algorithm ${entry.neoCryptoAlgorithm})`);
  }
  console.log('All entries verified.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
