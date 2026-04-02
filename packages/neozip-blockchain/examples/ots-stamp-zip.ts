#!/usr/bin/env node

/**
 * OTS Stamp ZIP - Create a ZIP file with OpenTimestamps proof
 *
 * Creates a ZIP from input files, computes merkle root, requests an
 * OpenTimestamps proof, and adds META-INF/TS-SUBMIT.OTS to the archive.
 * This mirrors the neozip-ots "zip" flow using our OTS add-on.
 *
 * Legacy/add-on example. For primary timestamping use the Zipstamp server
 * flow (stamp-zip, upgrade-zip).
 *
 * Usage:
 *   ts-node examples/ots-stamp-zip.ts <output.nzip> <input-file> [input-file2] ...
 *
 * Examples:
 *   yarn example:ots-stamp examples/output/ots.nzip examples/test-files/document.txt
 *   yarn example:ots-stamp examples/output/ots.nzip examples/test-files/*
 */

import { ZipkitNode, CompressOptions } from 'neozipkit/node';
import { createTimestamp, TIMESTAMP_SUBMITTED } from '../src/ots';
import * as fs from 'fs';
import * as path from 'path';

function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

function expandFilePatterns(patterns: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?')) {
      const patternDir = path.dirname(pattern);
      const patternBase = path.basename(pattern);
      const searchDir = path.isAbsolute(patternDir)
        ? patternDir
        : path.resolve(process.cwd(), patternDir === '.' ? '' : patternDir);

      if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
        continue;
      }

      const dirEntries = fs.readdirSync(searchDir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (entry.isFile() && !entry.name.startsWith('.') && matchesPattern(entry.name, patternBase)) {
          const filePath = path.join(searchDir, entry.name);
          const absPath = path.resolve(filePath);
          if (!seen.has(absPath)) {
            seen.add(absPath);
            files.push(absPath);
          }
        }
      }
    } else {
      const absPath = path.resolve(pattern);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile() && !seen.has(absPath)) {
        seen.add(absPath);
        files.push(absPath);
      }
    }
  }
  return files;
}

async function createOtsZip(outputZipPath: string, inputPatterns: string[]): Promise<void> {
  const resolvedFiles = expandFilePatterns(inputPatterns);
  if (resolvedFiles.length === 0) {
    throw new Error('No input files found matching the provided patterns');
  }

  console.log('OTS Stamp ZIP - Create ZIP with OpenTimestamps proof\n');
  console.log(`Output: ${outputZipPath}`);
  console.log(`Input files (${resolvedFiles.length}):`);
  resolvedFiles.forEach((f) => {
    const stat = fs.statSync(f);
    console.log(`  - ${path.basename(f)} (${stat.size} bytes)`);
  });
  console.log();

  const zip = new ZipkitNode();
  const outputDir = path.dirname(outputZipPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const options: CompressOptions = {
    level: 6,
    useZstd: true,
    useSHA256: true,
  };

  try {
    console.log('Step 1: Creating ZIP archive with SHA-256 hashes...');
    const writer = await zip.initializeZipFile(outputZipPath);

    for (const filePath of resolvedFiles) {
      const entry = await zip.prepareEntryFromFile(filePath);
      await zip.writeZipEntry(writer, entry, filePath, options);
    }

    console.log('Step 2: Calculating merkle root...');
    const merkleRoot = (zip as any).getMerkleRoot?.();
    if (!merkleRoot) {
      await zip.finalizeZipFile(writer);
      await zip.closeFile();
      throw new Error('Could not calculate merkle root (useSHA256: true is required)');
    }
    console.log(`  Merkle root: ${merkleRoot}\n`);

    console.log('Step 3: Requesting OpenTimestamps proof...');
    const ots = await createTimestamp(merkleRoot, { debug: false });
    if (!ots) {
      await zip.finalizeZipFile(writer);
      await zip.closeFile();
      throw new Error('Failed to create OpenTimestamps proof');
    }
    console.log(`  OTS proof size: ${ots.length} bytes\n`);

    console.log('Step 4: Adding OTS metadata to ZIP (META-INF/TS-SUBMIT.OTS)...');
    const tempOtsFile = path.join(outputDir, `.temp-ots-${Date.now()}.ots`);
    try {
      fs.writeFileSync(tempOtsFile, ots);
      const metadataEntry = await zip.prepareEntryFromFile(tempOtsFile);
      metadataEntry.filename = TIMESTAMP_SUBMITTED;
      metadataEntry.cmpMethod = 0; // STORED
      metadataEntry.compressedSize = ots.length;
      metadataEntry.uncompressedSize = ots.length;

      await zip.writeZipEntry(writer, metadataEntry, tempOtsFile, {
        level: 0,
        useZstd: false,
        useSHA256: false,
      });
    } finally {
      if (fs.existsSync(tempOtsFile)) {
        fs.unlinkSync(tempOtsFile);
      }
    }

    console.log('Step 5: Finalizing ZIP file...');
    const allEntries = zip.getDirectory();
    const centralDirOffset = writer.currentPosition;
    const centralDirSize = await zip.writeCentralDirectory(writer, allEntries);
    await zip.writeEndOfCentralDirectory(writer, allEntries.length, centralDirSize, centralDirOffset);
    await zip.finalizeZipFile(writer);
    await zip.closeFile();

    console.log(`\nCreated: ${outputZipPath}`);
    console.log('OpenTimestamps proof included (META-INF/TS-SUBMIT.OTS).');
    console.log('Verify with: yarn example:ots-verify ' + outputZipPath);
  } catch (err) {
    try {
      await zip.closeFile();
    } catch {
      // ignore
    }
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ts-node examples/ots-stamp-zip.ts <output.nzip> <input-file> [input-file2] ...');
    console.error('Example: yarn example:ots-stamp examples/output/ots.nzip examples/test-files/*');
    process.exit(1);
  }

  const outputZipPath = path.isAbsolute(args[0]) ? args[0] : path.resolve(process.cwd(), args[0]);
  const inputPatterns = args.slice(1);

  try {
    await createOtsZip(outputZipPath, inputPatterns);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
