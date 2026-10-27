#!/usr/bin/env node

/**
 * Create a ZipWiki-shaped `.zipwiki` with the general NeoZipKit writer APIs.
 *
 * Uses only `writeZipFileSync` / `makeOriginExtra` / `META_MANIFEST_JSON`.
 * Member order, store-by-suffix, and a minimal manifest are done inline here —
 * the kit has no ZipWiki-named API. Parse/OKF generation and full manifest
 * rules stay in ZipWiki.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  META_MANIFEST_JSON,
  makeOriginExtra,
  writeZipFileSync,
  ZipkitNode,
  type ZipBufferMember,
} from '../src/node';

function buildMinimalManifest(): Buffer {
  const manifest = {
    format: 'neozip',
    specVersion: '0.3.0',
    createdAt: new Date().toISOString(),
    profiles: ['zipwiki'],
    ai: { root: 'wiki', parsedDir: 'parsed', primaries: [] as unknown[] },
  };
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  console.log('Creating ZipWiki-shaped package with NeoZipKit...\n');

  const testDir = path.join(__dirname, 'test-files');
  const sourceMd = path.join(testDir, 'document.md');
  if (!fs.existsSync(sourceMd)) {
    console.error(`Missing test file: ${sourceMd}`);
    process.exit(1);
  }

  const primaryBytes = fs.readFileSync(sourceMd);
  // Pretend PDF so we can store it uncompressed (binary-like primary).
  const fakePdf = Buffer.concat([Buffer.from('%PDF-1.4\n', 'utf8'), primaryBytes]);
  const parseMd = Buffer.from(
    '# Document\n\nParsed stand-in for document.md (ZipWiki would emit real parse).\n',
    'utf8'
  );

  // CD order: META-INF → wiki/ → primaries (ZipWiki convention, not required by the AppNote).
  const members: ZipBufferMember[] = [
    { name: META_MANIFEST_JSON, data: buildMinimalManifest(), method: 0 },
    { name: 'wiki/parsed/docs/document.pdf.md', data: parseMd, method: 93, level: 7 },
    {
      name: 'docs/document.pdf',
      data: fakePdf,
      method: 0,
      // Extra Field 0x014F: origin locator (kit helper resolves nothing; caller supplies URI).
      additionalExtra: makeOriginExtra({
        uri: 'https://example.org/docs/document.pdf',
        size: fakePdf.length,
      }),
    },
  ];

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'example.zipwiki');

  writeZipFileSync(outPath, members);

  const zip = new ZipkitNode();
  const listed = await zip.loadZipFile(outPath);
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)\n`);
  console.log('Central directory order:');
  for (const entry of listed) {
    const method =
      entry.cmpMethod === 0
        ? 'store'
        : entry.cmpMethod === 8
          ? 'deflate'
          : entry.cmpMethod === 93
            ? 'zstd'
            : String(entry.cmpMethod);
    console.log(`  ${entry.filename}  [${method}]`);
  }

  const result = await zip.extractZipFile(outPath, outDir, {
    testOnly: true,
    skipHashCheck: false,
  });
  console.log(`\nIntegrity OK: ${result.filesExtracted} members, CRC-32 verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
