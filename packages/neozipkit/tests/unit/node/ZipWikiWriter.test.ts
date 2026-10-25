/**
 * ZipWiki-compatible writer — CD order, 0x014F origins, store-by-suffix,
 * minimal manifest, round-trip via ZipkitNode.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Zipkit from '../../../src/core/Zipkit';
import { HDR_ID } from '../../../src/core/constants/Headers';
import { parseOriginFromEntry } from '../../../src/core/origin/OriginExtra';
import ZipkitNode from '../../../src/node/ZipkitNode';
import {
  ZIPWIKI_MANIFEST_ENTRY,
  buildMinimalZipWikiManifest,
  classifyZipWikiEntry,
  serializeZipWikiManifest,
  shouldStoreZipWikiBySuffix,
  sortZipWikiMembers,
  writeZipWikiBufferSync,
} from '../../../src/node/zipwiki';

describe('ZipWikiWriter', () => {
  test('classifyZipWikiEntry matches ZipWiki meta / ai / primary', () => {
    expect(classifyZipWikiEntry('META-INF/manifest.json')).toBe('meta');
    expect(classifyZipWikiEntry('wiki/parsed/doc.pdf.md')).toBe('ai');
    expect(classifyZipWikiEntry('wiki/okf/index.md')).toBe('ai');
    expect(classifyZipWikiEntry('docs/doc.pdf')).toBe('primary');
    expect(classifyZipWikiEntry('context/parsed/a.md', 'context')).toBe('ai');
  });

  test('sortZipWikiMembers puts manifest first, then wiki, then primaries', () => {
    const sorted = sortZipWikiMembers([
      { name: 'docs/a.pdf' },
      { name: 'wiki/parsed/a.pdf.md' },
      { name: 'META-INF/other.json' },
      { name: 'META-INF/manifest.json' },
      { name: 'wiki/okf/index.md' },
      { name: 'readme.txt' },
    ]);
    expect(sorted.map((m) => m.name)).toEqual([
      'META-INF/manifest.json',
      'META-INF/other.json',
      'wiki/parsed/a.pdf.md',
      'wiki/okf/index.md',
      'docs/a.pdf',
      'readme.txt',
    ]);
  });

  test('shouldStoreZipWikiBySuffix covers ZipWiki binary defaults', () => {
    expect(shouldStoreZipWikiBySuffix('docs/report.pdf')).toBe(true);
    expect(shouldStoreZipWikiBySuffix('img/photo.PNG')).toBe(true);
    expect(shouldStoreZipWikiBySuffix('wiki/parsed/report.pdf.md')).toBe(false);
    expect(shouldStoreZipWikiBySuffix('notes.txt')).toBe(false);
    expect(shouldStoreZipWikiBySuffix('x.pdf', [])).toBe(false);
  });

  test('buildMinimalZipWikiManifest emits APPNOTE-shaped JSON', () => {
    const manifest = buildMinimalZipWikiManifest({
      createdAt: '2026-10-24T12:00:00.000Z',
      includeAi: true,
      digest: 'sha256:deadbeef',
    });
    expect(manifest.format).toBe('neozip');
    expect(manifest.specVersion).toBe('0.2.0');
    expect(manifest.profiles).toEqual(['zipwiki']);
    expect(manifest.ai).toMatchObject({
      root: 'wiki',
      parsedDir: 'parsed',
      digest: 'sha256:deadbeef',
    });
    const text = serializeZipWikiManifest(manifest);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).createdAt).toBe('2026-10-24T12:00:00.000Z');
  });

  test('writeZipWikiBufferSync: CD order, PDF store, origin 0x014F, optional 0x014E', () => {
    const originUri = 'https://example.org/docs/report.pdf';
    const pdfBytes = Buffer.from('%PDF-1.4 fake binary payload', 'utf8');
    const parseMd = Buffer.from('# Report\n\nParsed notes.\n', 'utf8');
    const manifest = Buffer.from(
      serializeZipWikiManifest(
        buildMinimalZipWikiManifest({
          createdAt: '2026-10-24T12:00:00.000Z',
          includeAi: true,
        })
      ),
      'utf8'
    );

    const buf = writeZipWikiBufferSync(
      [
        {
          name: 'docs/report.pdf',
          data: pdfBytes,
          origin: { uri: originUri, size: pdfBytes.length },
        },
        { name: 'wiki/parsed/docs/report.pdf.md', data: parseMd },
        { name: ZIPWIKI_MANIFEST_ENTRY, data: manifest, method: 0 },
      ],
      { sha256Extra: true, method: 93, level: 7 }
    );

    const zip = new Zipkit();
    const entries = zip.loadZip(buf);
    expect(entries.map((e) => e.filename)).toEqual([
      ZIPWIKI_MANIFEST_ENTRY,
      'wiki/parsed/docs/report.pdf.md',
      'docs/report.pdf',
    ]);

    const pdf = entries.find((e) => e.filename === 'docs/report.pdf')!;
    expect(pdf.cmpMethod).toBe(0); // store-by-suffix
    const loc = parseOriginFromEntry(pdf);
    expect(loc?.uri).toBe(originUri);
    expect(loc?.size).toBe(pdfBytes.length);
    expect(pdf.additionalExtra?.readUInt16LE(0)).toBe(HDR_ID.ORIGIN);

    const md = entries.find(
      (e) => e.filename === 'wiki/parsed/docs/report.pdf.md'
    )!;
    expect(md.sha256).toBeTruthy();
    expect(md.sha256!.length).toBe(64);
  });

  test('ZipkitNode.writeZipWikiMembersSync round-trips on disk', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nz-zipwiki-'));
    const zipPath = path.join(tmp, 'sample.zipwiki');
    try {
      const node = new ZipkitNode();
      node.writeZipWikiMembersSync(zipPath, [
        {
          name: ZIPWIKI_MANIFEST_ENTRY,
          data: Buffer.from(
            serializeZipWikiManifest(buildMinimalZipWikiManifest({ includeAi: true })),
            'utf8'
          ),
          method: 0,
        },
        {
          name: 'wiki/parsed/hello.txt.md',
          data: Buffer.from('# Hello\n', 'utf8'),
          method: 0,
        },
        {
          name: 'hello.txt',
          data: Buffer.from('hello world\n', 'utf8'),
          method: 0,
          origin: { uri: 'file:///tmp/hello.txt', size: 12 },
        },
      ]);

      const loaded = await node.loadZipFile(zipPath);
      expect(loaded.map((e) => e.filename)).toEqual([
        ZIPWIKI_MANIFEST_ENTRY,
        'wiki/parsed/hello.txt.md',
        'hello.txt',
      ]);
      expect(parseOriginFromEntry(loaded[2])?.uri).toBe('file:///tmp/hello.txt');

      // Default extract skips META-INF/*; content members still CRC-check.
      const result = await node.extractZipFile(zipPath, tmp, {
        testOnly: true,
        skipHashCheck: false,
      });
      expect(result.filesExtracted).toBe(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
