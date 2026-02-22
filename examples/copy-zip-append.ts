#!/usr/bin/env node

/**
 * Copy ZIP and Append Example
 *
 * Copies entry data from example.zip into copied.zip, appends append-data.json
 * in a single pass using ZipCopyNode: copyZipEntriesOnly, append the new file,
 * then writeCentralDirectoryAndEOCD.
 */

import { ZipCopyNode, ZipkitNode, crc32, CMP_METHOD } from '../src/node';
import ZipEntry from '../src/core/ZipEntry';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  console.log('Copy ZIP and append file example...\n');

  const sourceZip = path.join(__dirname, 'output', 'example.zip');
  let actualSourceZip = sourceZip;
  if (!fs.existsSync(sourceZip)) {
    const outputDir = path.dirname(sourceZip);
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.zip'));
      if (files.length > 0) {
        actualSourceZip = path.join(outputDir, files[0]);
        console.log(`⚠️  example.zip not found, using: ${files[0]}\n`);
      }
    }
  }

  if (!fs.existsSync(actualSourceZip)) {
    console.error(`❌ Error: Source ZIP not found: ${actualSourceZip}`);
    console.error('   Run create-zip.ts first, or point sourceZip to an existing ZIP.');
    process.exit(1);
  }

  const appendFilePath = path.join(__dirname, 'append-data.json');
  if (!fs.existsSync(appendFilePath)) {
    console.error(`❌ Error: File to append not found: ${appendFilePath}`);
    process.exit(1);
  }

  const destZip = path.join(__dirname, 'output', 'copied.zip');
  const outputDir = path.dirname(destZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const zipkitNode = new ZipkitNode();
  const zipCopy = new ZipCopyNode(zipkitNode);

  try {
    // 1. Copy only entry data (no central directory or EOCD yet)
    console.log('1. Copying entry data from source ZIP...');
    const { destPath, dataEndOffset, copiedEntries } = await zipCopy.copyZipEntriesOnly(
      actualSourceZip,
      destZip
    );
    console.log(`   Copied ${copiedEntries.length} entries; data ends at offset ${dataEndOffset}\n`);

    // 2. Append append-data.json as a stored entry
    const entryName = 'append-data.json';
    const fileData = fs.readFileSync(appendFilePath);
    const fileCrc = crc32(fileData) >>> 0;
    const fileSize = fileData.length;

    const entry = new ZipEntry(entryName, null, false);
    entry.localHdrOffset = dataEndOffset;
    entry.cmpMethod = CMP_METHOD.STORED;
    entry.crc = fileCrc;
    entry.compressedSize = fileSize;
    entry.uncompressedSize = fileSize;
    entry.timeDateDOS = entry.setDateTime(new Date());

    const localHeaderBuf = entry.createLocalHdr();
    const destFd = fs.openSync(destPath, 'r+');
    try {
      fs.writeSync(destFd, localHeaderBuf, 0, localHeaderBuf.length, dataEndOffset);
      fs.writeSync(destFd, fileData, 0, fileData.length, dataEndOffset + localHeaderBuf.length);
    } finally {
      fs.closeSync(destFd);
    }
    console.log(`2. Appended "${entryName}" (${formatBytes(fileSize)} stored)\n`);

    // 3. Write central directory and EOCD for all entries (copied + appended)
    const allEntries = [...copiedEntries, entry];
    zipCopy.writeCentralDirectoryAndEOCD(destPath, allEntries, { zipComment: '' });
    console.log('3. Wrote central directory and EOCD.\n');

    console.log(`✅ Done: ${destZip}\n`);

    console.log('Entries in final ZIP:');
    console.log('─'.repeat(80));
    console.log(
      padRight('Filename', 50) + padLeft('Compressed', 14) + padLeft('Offset', 14)
    );
    console.log('─'.repeat(80));
    allEntries.forEach((e) => {
      console.log(
        padRight(e.filename.length > 48 ? e.filename.slice(0, 45) + '...' : e.filename, 50) +
          padLeft(formatBytes(e.compressedSize), 14) +
          padLeft(`0x${e.localHdrOffset.toString(16)}`, 14)
      );
    });
    console.log('─'.repeat(80));
    console.log(`Total: ${allEntries.length} entries`);

    if (fs.existsSync(destZip)) {
      const destStats = fs.statSync(destZip);
      console.log(`\nArchive size: ${formatBytes(destStats.size)}`);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
