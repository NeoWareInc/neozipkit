#!/usr/bin/env node

/**
 * Create a ZipWiki-shaped `.zipwiki` with NeoZipKit.
 *
 * Demonstrates CD order (META-INF → wiki/ → primaries), Extra Field 0x014F
 * on a primary, store-by-suffix for PDF, and a minimal META-INF/manifest.json.
 * Full parse/OKF generation stays in ZipWiki — this is the container layer.
 */

import * as fs from 'fs';
import * as path from 'path';
import ZipkitNode from '../src/node';
import {
  ZIPWIKI_MANIFEST_ENTRY,
  buildMinimalZipWikiManifest,
  serializeZipWikiManifest,
} from '../src/node/zipwiki';

async function main() {
  console.log('Creating ZipWiki-shaped package with NeoZipKit...\n');

  const testDir = path.join(__dirname, 'test-files');
  const sourceMd = path.join(testDir, 'document.md');
  if (!fs.existsSync(sourceMd)) {
    console.error(`Missing test file: ${sourceMd}`);
    process.exit(1);
  }

  const primaryBytes = fs.readFileSync(sourceMd);
  // Pretend PDF so store-by-suffix kicks in (ZipWiki default for binaries).
  const fakePdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'utf8'),
    primaryBytes,
  ]);
  const parseMd = Buffer.from(
    '# Document\n\nParsed stand-in for document.md (ZipWiki would emit real parse).\n',
    'utf8'
  );
  const manifest = Buffer.from(
    serializeZipWikiManifest(
      buildMinimalZipWikiManifest({
        includeAi: true,
        profiles: ['zipwiki'],
      })
    ),
    'utf8'
  );

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'example.zipwiki');

  const zip = new ZipkitNode();
  zip.writeZipWikiMembersSync(
    outPath,
    [
      // Intentionally out of CD order — writer reorders.
      {
        name: 'docs/document.pdf',
        data: fakePdf,
        origin: {
          uri: 'https://example.org/docs/document.pdf',
          size: fakePdf.length,
        },
      },
      { name: 'wiki/parsed/docs/document.pdf.md', data: parseMd },
      { name: ZIPWIKI_MANIFEST_ENTRY, data: manifest, method: 0 },
    ],
    { method: 93, level: 7 }
  );

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
  console.log(
    `\nIntegrity OK: ${result.filesExtracted} members, CRC-32 verified.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
