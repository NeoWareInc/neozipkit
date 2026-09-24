#!/usr/bin/env node

/**
 * Force Zip64 Example
 *
 * Creates a Zip64 archive from the small files in `test-files/` using
 * `CompressOptions.forceZip64` (APPNOTE MAY emit Zip64 even when sizes fit
 * classic fields). Then lists entries and runs integrity test (CRC) without
 * extracting.
 *
 * Usage:
 *   pnpm example:create-zip64
 *   # or
 *   npx ts-node examples/create-zip64.ts
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
import type ZipEntry from '../src/core/ZipEntry';
import * as fs from 'fs';
import * as path from 'path';

const ZIP64_EOCD_SIG = Buffer.from([0x50, 0x4b, 0x06, 0x06]);
const ZIP64_LOCATOR_SIG = Buffer.from([0x50, 0x4b, 0x06, 0x07]);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function padRight(str: string, length: number): string {
  return (str + ' '.repeat(length)).slice(0, length);
}

function padLeft(str: string, length: number): string {
  return (' '.repeat(length) + str).slice(-length);
}

function listEntries(entries: ZipEntry[]): void {
  console.log('─'.repeat(88));
  console.log(
    padRight('Filename', 28) +
      padLeft('Length', 10) +
      padLeft('Size', 10) +
      padLeft('Zip64', 8) +
      padLeft('Ver', 6) +
      '   ' +
      padRight('Method', 10)
  );
  console.log('─'.repeat(88));

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const entry of entries) {
    const filename = entry.filename || '(unnamed)';
    const original = entry.uncompressedSize || 0;
    const compressed = entry.compressedSize || 0;
    totalOriginal += original;
    totalCompressed += compressed;

    console.log(
      padRight(
        filename.length > 26 ? filename.substring(0, 23) + '...' : filename,
        28
      ) +
        padLeft(String(original), 10) +
        padLeft(String(compressed), 10) +
        padLeft(entry.usesZip64Extra ? 'yes' : 'no', 8) +
        padLeft(String(entry.verExtract || 0), 6) +
        '   ' +
        padRight(entry.cmpMethodToString(), 10)
    );
  }

  console.log('─'.repeat(88));
  console.log(
    padRight('Total', 28) +
      padLeft(String(totalOriginal), 10) +
      padLeft(String(totalCompressed), 10) +
      padLeft('', 8) +
      padLeft('', 6) +
      '   ' +
      padRight(formatBytes(totalOriginal), 10)
  );
  console.log('─'.repeat(88));
}

async function main() {
  console.log('Force Zip64 create / list / test example\n');

  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
    path.join(testDir, 'document.md'),
    path.join(testDir, 'document.txt'),
    path.join(testDir, 'data.json'),
  ];

  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      console.error(`❌ Test file not found: ${file}`);
      process.exit(1);
    }
  }

  console.log('Source files:');
  for (const file of testFiles) {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${stats.size} bytes)`);
  }
  console.log();

  const outputZip = path.join(__dirname, 'output', 'example-zip64.zip');
  const outputDir = path.dirname(outputZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const options: CompressOptions = {
    level: 6,
    useZstd: false,
    useSHA256: false,
    forceZip64: true,
  };

  const zip = new ZipkitNode();

  try {
    console.log('1) Creating Zip64 archive (forceZip64: true)...');
    await zip.createZipFromFiles(testFiles, outputZip, options);

    const raw = fs.readFileSync(outputZip);
    const hasEocd = raw.includes(ZIP64_EOCD_SIG);
    const hasLocator = raw.includes(ZIP64_LOCATOR_SIG);
    console.log(`✅ Created: ${outputZip} (${formatBytes(raw.length)})`);
    console.log(`   Zip64 EOCD: ${hasEocd ? 'yes' : 'NO'}`);
    console.log(`   Zip64 locator: ${hasLocator ? 'yes' : 'NO'}`);
    if (!hasEocd || !hasLocator) {
      console.error('❌ Expected Zip64 EOCD + locator were not found.');
      process.exit(1);
    }
    console.log();

    console.log('2) Listing archive (loadZipFile)...');
    const listZip = new ZipkitNode();
    const entries = await listZip.loadZipFile(outputZip);
    listEntries(entries);

    const allZip64 = entries.every((e) => e.usesZip64Extra);
    const sizesMatchSources = testFiles.every((file) => {
      const base = path.basename(file);
      const entry = entries.find((e) => e.filename === base);
      return entry && entry.uncompressedSize === fs.statSync(file).size;
    });
    if (!allZip64) {
      console.error('❌ Not all entries reported usesZip64Extra.');
      process.exit(1);
    }
    if (!sizesMatchSources) {
      console.error('❌ Listed uncompressed sizes do not match source files.');
      process.exit(1);
    }
    console.log('✅ List view: Zip64 extras present; sizes match sources.\n');

    console.log('3) Testing integrity (extractZipFile testOnly)...');
    const testZip = new ZipkitNode();
    const testResult = await testZip.extractZipFile(outputZip, outputDir, {
      testOnly: true,
      skipHashCheck: false,
    });
    console.log(
      `✅ Integrity OK — tested ${testResult.filesExtracted} entr${
        testResult.filesExtracted === 1 ? 'y' : 'ies'
      } (${formatBytes(testResult.bytesExtracted)})`
    );

    console.log('\nDone. forceZip64 create → list → test passed.');
  } catch (error) {
    console.error('❌ forceZip64 example failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
