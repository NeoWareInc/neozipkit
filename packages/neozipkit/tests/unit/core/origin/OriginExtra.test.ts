/**
 * Extra Field 0x014F (original locator) — write origin URL, reload, extract URI,
 * and integrity-test the member payload.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Zipkit from '../../../../src/core/Zipkit';
import { HDR_ID } from '../../../../src/core/constants/Headers';
import {
  makeOriginExtra,
  parseOriginFromEntry,
  parseOriginFromExtra,
} from '../../../../src/core/origin/OriginExtra';
import { buildZipBufferSync } from '../../../../src/node/buildZipBuffer';
import ZipkitNode from '../../../../src/node/ZipkitNode';

describe('Origin Extra Field 0x014F', () => {
  const originUri = 'https://example.org/docs/sample.pdf';
  const payload = Buffer.from('# Parsed notes\n\nFrom sample.pdf\n', 'utf8');

  test('makeOriginExtra / parseOriginFromExtra round-trip URI', () => {
    const extra = makeOriginExtra({ uri: originUri, size: 1234 });
    expect(extra.readUInt16LE(0)).toBe(HDR_ID.ORIGIN);
    const loc = parseOriginFromExtra(extra);
    expect(loc).not.toBeNull();
    expect(loc!.uri).toBe(originUri);
    expect(loc!.size).toBe(1234);
  });

  test('write archive with origin URL, extract URI, and integrity-test', async () => {
    const originExtra = makeOriginExtra({
      uri: originUri,
      size: payload.length,
    });

    const buf = buildZipBufferSync([
      {
        name: 'wiki/parsed/sample.pdf.md',
        data: payload,
        method: 0,
        additionalExtra: originExtra,
      },
    ]);

    // Buffer load: caller extras survive on additionalExtra
    const zipkit = new Zipkit();
    const entries = zipkit.loadZip(buf);
    expect(entries.length).toBe(1);
    expect(entries[0].filename).toBe('wiki/parsed/sample.pdf.md');
    expect(entries[0].additionalExtra).toBeTruthy();

    const fromEntry = parseOriginFromEntry(entries[0]);
    expect(fromEntry).not.toBeNull();
    expect(fromEntry!.uri).toBe(originUri);
    expect(fromEntry!.size).toBe(payload.length);

    // File path: list + CRC integrity (testOnly) + origin still readable
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nz-origin-'));
    const zipPath = path.join(tmpDir, 'with-origin.zip');
    try {
      fs.writeFileSync(zipPath, buf);

      const nodeZip = new ZipkitNode();
      const loaded = await nodeZip.loadZipFile(zipPath);
      expect(loaded.length).toBe(1);

      const loc = parseOriginFromEntry(loaded[0]);
      expect(loc?.uri).toBe(originUri);

      const result = await nodeZip.extractZipFile(zipPath, tmpDir, {
        testOnly: true,
        skipHashCheck: false,
      });
      expect(result.filesExtracted).toBe(1);
      expect(result.bytesExtracted).toBe(payload.length);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
