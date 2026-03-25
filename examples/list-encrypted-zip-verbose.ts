#!/usr/bin/env node

/**
 * List verbose central-directory details for encrypted ZIP entries.
 *
 * Uses ZipEntry.showVerboseInfo(), which prints compression method, GP flags,
 * encryption scheme (WinZip AES vs NeoEncrypt vs ZipCrypto), CRC/sizes, and
 * a decoded dump of extra fields (including 0x9901 AES and 0x024E NEO crypto).
 *
 * No password is required — this only reads metadata from the central directory.
 *
 * Usage:
 *   npx ts-node examples/list-encrypted-zip-verbose.ts
 *   npx ts-node examples/list-encrypted-zip-verbose.ts path/to/archive.zip
 *
 * Default archives (if no path given): tries output/aes-example.zip then
 * output/neo-aes-example.zip (run create-aes-zip.ts / create-neo-aes-zip.ts first).
 */

import ZipkitNode from '../src/node';
import { Logger } from '../src/core/components/Logger';
import * as fs from 'fs';
import * as path from 'path';

async function dumpArchive(archivePath: string): Promise<void> {
  if (!fs.existsSync(archivePath)) {
    console.error(`Skip (not found): ${archivePath}`);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Archive: ${archivePath}`);
  console.log('='.repeat(80) + '\n');

  const zip = new ZipkitNode();
  const entries = await zip.loadZipFile(archivePath);

  const files = entries.filter((e) => !e.isDirectory);
  const encrypted = files.filter((e) => e.isEncrypted);

  console.log(
    `Entries: ${files.length} file(s), ${encrypted.length} encrypted (by GP flag bit 0)\n`
  );

  if (encrypted.length === 0) {
    console.log('No encrypted file entries in this archive. Showing first file entry verbose block (if any):\n');
    const first = files[0];
    if (first) {
      first.showVerboseInfo();
    }
    return;
  }

  for (const entry of encrypted) {
    entry.showVerboseInfo();
    console.log('');
  }
}

async function main() {
  Logger.setLevel('info');

  const argPath = process.argv[2];
  const defaults = [
    path.join(__dirname, 'output', 'aes-example.zip'),
    path.join(__dirname, 'output', 'neo-aes-example.zip'),
  ];

  const paths = argPath ? [path.resolve(argPath)] : defaults;

  if (!argPath) {
    console.log('No path argument — listing defaults (AES then NeoEncrypt examples if present).\n');
    console.log('Pass a .zip path to inspect a specific file.\n');
  }

  let anyOk = false;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      anyOk = true;
      await dumpArchive(p);
    } else if (argPath) {
      console.error(`ZIP not found: ${p}`);
      process.exit(1);
    }
  }

  if (!anyOk && !argPath) {
    console.error('No default ZIPs found. Create one of:');
    for (const p of defaults) {
      console.error(`  - ${p}`);
    }
    console.error('\nOr run: npx ts-node examples/list-encrypted-zip-verbose.ts /path/to/encrypted.zip');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
