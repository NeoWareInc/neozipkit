import { buildZipBufferSync, type ZipBufferMember } from '../../../src/node/buildZipBuffer';
import {
  ZipIntegrityError,
  ZipReaderBrowser,
} from '../../../src/browser/ZipReaderBrowser';
import { HDR_ID } from '../../../src/core/constants/Headers';
import { makeOriginExtra, parseOriginFromExtra } from '../../../src/core/origin/OriginExtra';
import { getExtraField } from '../../../src/core/extra';
import { createManifest, serializeManifest } from '../../../src/core/manifest';

const text = Buffer.from('hello zipwiki '.repeat(200));
const big = Buffer.alloc(300_000, 'abc');
const manifestJson = serializeManifest(
  createManifest({ specVersion: '0.3.0-draft', createdAt: '2026-10-27T00:00:00.000Z' })
);

function members(): ZipBufferMember[] {
  return [
    { name: 'META-INF/manifest.json', data: Buffer.from(manifestJson), method: 0 },
    { name: 'a.txt', data: text, method: 8, useSHA256: true },
    { name: 'b.bin', data: big, method: 93 },
    { name: 'c.txt', data: Buffer.from('stored'), method: 0 },
    {
      name: 'wiki/parsed/p.pdf.md',
      data: Buffer.from('# parsed'),
      method: 0,
      additionalExtra: makeOriginExtra({ uri: 'https://example.org/p.pdf', size: 42 }),
    },
    { name: 'empty.txt', data: Buffer.alloc(0) },
  ];
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('ZipReaderBrowser', () => {
  test('lists entries and reads store / deflate / zstd members', async () => {
    const zip = buildZipBufferSync(members());
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(zip));
    expect(r.size).toBe(zip.length);
    expect(r.entries().map((e) => e.name)).toEqual([
      'META-INF/manifest.json',
      'a.txt',
      'b.bin',
      'c.txt',
      'wiki/parsed/p.pdf.md',
      'empty.txt',
    ]);
    expect(r.getEntry('a.txt')!.method).toBe(8);
    expect(r.getEntry('b.bin')!.method).toBe(93);
    expect(r.getEntry('nope')).toBeNull();
    expect(Buffer.from(await r.readEntry('a.txt')).equals(text)).toBe(true);
    // zstd: native DecompressionStream('zstd') when present, else fzstd fallback.
    expect(Buffer.from(await r.readEntry('b.bin')).equals(big)).toBe(true);
    expect(Buffer.from(await r.readEntry('c.txt')).toString()).toBe('stored');
    expect((await r.readEntry('empty.txt')).length).toBe(0);
  });

  test('readRaw returns stored bytes and origin extra (0x014F)', async () => {
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(buildZipBufferSync(members())));
    const raw = await r.readRaw('a.txt');
    expect(raw.method).toBe(8);
    expect(raw.compressed.length).toBe(r.getEntry('a.txt')!.compressedSize);
    expect(raw.uncompressedSize).toBe(text.length);
    expect(getExtraField(Buffer.from(raw.centralExtra), HDR_ID.SHA256)?.length).toBe(32);

    const p = await r.readRaw('wiki/parsed/p.pdf.md');
    const origin = parseOriginFromExtra(Buffer.from(p.centralExtra));
    expect(origin?.uri).toBe('https://example.org/p.pdf');
    expect(origin?.size).toBe(42);
    expect(getExtraField(Buffer.from(p.localExtra), HDR_ID.SHA256)).toBeNull();
  });

  test('verifyAll reports progress and passes on a good archive', async () => {
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(buildZipBufferSync(members())));
    const seen: string[] = [];
    await r.verifyAll(({ name, index, total }) => {
      expect(total).toBe(6);
      expect(index).toBe(seen.length);
      seen.push(name);
    });
    expect(seen).toHaveLength(6);
  });

  test('readManifest parses META-INF/manifest.json (case-insensitive)', async () => {
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(buildZipBufferSync(members())));
    const m = await r.readManifest();
    expect(m.format).toBe('neozip');
    expect(m.specVersion).toBe('0.3.0-draft');

    const upper = await ZipReaderBrowser.fromArrayBuffer(
      toArrayBuffer(
        buildZipBufferSync([
          { name: 'META-INF/MANIFEST.JSON', data: Buffer.from(manifestJson), method: 0 },
        ])
      )
    );
    expect((await upper.readManifest()).specVersion).toBe('0.3.0-draft');

    const none = await ZipReaderBrowser.fromArrayBuffer(
      toArrayBuffer(buildZipBufferSync([{ name: 'x.txt', data: Buffer.from('x'), method: 0 }]))
    );
    await expect(none.readManifest()).rejects.toThrow(/not found/);
  });

  test('corrupted payload fails with crc; skipHashCheck bypasses it', async () => {
    const zip = Buffer.from(
      buildZipBufferSync([{ name: 'c.txt', data: Buffer.from('stored'), method: 0 }])
    );
    const at = zip.indexOf('stored');
    zip[at] ^= 0xff;
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(zip));
    await expect(r.readEntry('c.txt')).rejects.toMatchObject({ code: 'crc', entry: 'c.txt' });
    await expect(r.readEntry('c.txt')).rejects.toBeInstanceOf(ZipIntegrityError);
    await expect(r.verifyAll()).rejects.toMatchObject({ code: 'crc' });
    expect((await r.readEntry('c.txt', { skipHashCheck: true })).length).toBe(6);
  });

  test('0x014E mismatch is detected', async () => {
    const zip = Buffer.from(
      buildZipBufferSync([{ name: 'a.txt', data: text, method: 0, useSHA256: true }])
    );
    const r0 = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(zip));
    const e = r0.getEntry('a.txt')!;
    // Flip a byte inside the central-directory 0x014E digest only.
    const needle = getExtraField(Buffer.from(e.centralExtra), HDR_ID.SHA256)!;
    const idx = zip.lastIndexOf(needle);
    zip[idx] ^= 0xff;
    const r = await ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(zip));
    await expect(r.readEntry('a.txt')).rejects.toMatchObject({ code: 'sha256' });
  });

  test('fromReadAt only reads the touched ranges', async () => {
    const zip = buildZipBufferSync([
      { name: 'big.bin', data: Buffer.alloc(2_000_000, 7), method: 0 },
      { name: 'small.txt', data: Buffer.from('tiny'), method: 0 },
    ]);
    let bytes = 0;
    const r = await ZipReaderBrowser.fromReadAt(async (offset, length) => {
      bytes += length;
      return new Uint8Array(zip.subarray(offset, offset + length));
    }, zip.length);
    expect(bytes).toBeLessThan(10_000);
    const after = bytes;
    expect(Buffer.from(await r.readEntry('small.txt')).toString()).toBe('tiny');
    expect(bytes - after).toBeLessThan(500);
  });

  test('fromBlob reads via Blob.slice', async () => {
    const zip = buildZipBufferSync(members());
    const r = await ZipReaderBrowser.fromBlob(new Blob([new Uint8Array(zip)]));
    expect(Buffer.from(await r.readEntry('a.txt')).equals(text)).toBe(true);
  });

  test('rejects non-zip input with a structure error', async () => {
    await expect(
      ZipReaderBrowser.fromArrayBuffer(toArrayBuffer(Buffer.alloc(100, 1)))
    ).rejects.toMatchObject({ code: 'structure' });
  });
});
