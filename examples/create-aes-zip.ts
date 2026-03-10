#!/usr/bin/env node

/**
 * Create AES-256 Encrypted ZIP Example
 * 
 * Demonstrates creating a WinZip-compatible AES-256 encrypted ZIP archive.
 * The resulting file can be opened with WinZip, 7-Zip, or any tool that
 * supports the WinZip AES specification (AE-1).
 */

import ZipkitNode from '../src/node';
import type { CompressOptions } from '../src/core';
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
  const password = 'NeoZipTest2025!';
  
  console.log('Creating AES-256 encrypted ZIP archive...');
  console.log(`Password: "${password}"\n`);

  const testDir = path.join(__dirname, 'test-files');
  const testFiles = [
    path.join(testDir, 'file1.txt'),
    path.join(testDir, 'file2.txt'),
    path.join(testDir, 'document.md'),
    path.join(testDir, 'data.json')
  ];

  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      console.error(`Error: Test file not found: ${file}`);
      console.error('   Make sure test-files directory contains the required files.');
      process.exit(1);
    }
  }

  console.log('Source files:');
  testFiles.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${stats.size} bytes)`);
  });
  console.log();

  const zip = new ZipkitNode();

  const outputZip = path.join(__dirname, 'output', 'aes-example.zip');
  const outputDir = path.dirname(outputZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const options: CompressOptions = {
    level: 6,
    useZstd: false,
    useSHA256: false,
    password: password,
    encryptionMethod: 'aes256',
  };

  try {
    console.log('Creating ZIP with AES-256 encryption (WinZip AE-1 format)...');
    
    await zip.createZipFromFiles(testFiles, outputZip, options);

    console.log(`ZIP archive created: ${outputZip}\n`);

    // Load the ZIP to get entry details
    const zip2 = new ZipkitNode();
    (zip2 as any).password = password;
    await zip2.loadZipFile(outputZip);
    const entries = zip2.getDirectory();

    console.log('Encryption Summary:');
    console.log('-'.repeat(85));
    console.log(
      padRight('Filename', 25) +
      padLeft('Original', 10) +
      padLeft('Encrypted', 12) +
      padLeft('Ratio', 10) +
      '   ' +
      padRight('Method', 12) +
      padRight('Encryption', 12)
    );
    console.log('-'.repeat(85));

    let totalOriginal = 0;
    let totalCompressed = 0;

    entries.forEach((entry) => {
      const filename = entry.filename || '(unnamed)';
      const original = entry.uncompressedSize || 0;
      const compressed = entry.compressedSize || 0;
      const ratio = original > 0 ? ((1 - compressed / original) * 100).toFixed(1) : '0.0';
      const method = entry.cmpMethodToString();
      const encryption = entry.isEncrypted ? (entry.aesVersion > 0 ? `AE-${entry.aesVersion}` : 'ZipCrypto') : 'None';

      totalOriginal += original;
      totalCompressed += compressed;

      console.log(
        padRight(filename.length > 23 ? filename.substring(0, 20) + '...' : filename, 25) +
        padLeft(formatBytes(original), 10) +
        padLeft(formatBytes(compressed), 12) +
        padLeft(ratio + '%', 10) +
        '   ' +
        padRight(method, 12) +
        padRight(encryption, 12)
      );
    });

    console.log('-'.repeat(85));

    if (fs.existsSync(outputZip)) {
      const zipStats = fs.statSync(outputZip);
      console.log(`\nArchive file size: ${formatBytes(zipStats.size)}`);
    }

    console.log('\nTo verify compatibility, extract with:');
    console.log(`  7z x ${outputZip} -p${password}`);
    console.log(`  unzip -P ${password} ${outputZip}`);

  } catch (error) {
    console.error('Error creating AES-encrypted ZIP archive:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
