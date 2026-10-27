import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildZipBufferSync, type ZipBufferMember } from '../../../src/node/buildZipBuffer';
import { ZipIntegrityError, ZipReaderNode } from '../../../src/node/ZipReaderNode';
import { HDR_ID } from '../../../src/core/constants/Headers';
import { makeOriginExtra, parseOriginFromExtra } from '../../../src/core/origin/OriginExtra';
import { getExtraField } from '../../../src/core/extra';
import { sha256 } from '../../../src/core/encryption/ZipCrypto';

const text = Buffer.from('hello zipwiki '.repeat(200));
const big = Buffer.alloc(300_000, 'abc');

function members(): ZipBufferMember[] {
  return [
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

describe('ZipReaderNode', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zrn-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('lists entries and reads every method from a buffer', () => {
    const r = ZipReaderNode.fromBuffer(buildZipBufferSync(members()));
    expect(r.entries().map((e) => e.name)).toEqual([
      'a.txt',
      'b.bin',
      'c.txt',
      'wiki/parsed/p.pdf.md',
      'empty.txt',
    ]);
    expect(r.getEntry('a.txt')!.method).toBe(8);
    expect(r.getEntry('b.bin')!.method).toBe(93);
    expect(r.getEntry('nope')).toBeNull();
    expect(r.readEntry('a.txt').equals(text)).toBe(true);
    expect(r.readEntry('b.bin').equals(big)).toBe(true);
    expect(r.readEntry('c.txt').toString()).toBe('stored');
    expect(r.readEntry('empty.txt').length).toBe(0);
    expect(r.getEntry('a.txt')!.uncompressedSize).toBe(text.length);
    r.close();
  });

  test('open(path) uses positioned reads, not the whole file', () => {
    const file = path.join(dir, 'big.zip');
    const zip = buildZipBufferSync([
      { name: 'big.bin', data: Buffer.alloc(2_000_000, 7), method: 0 },
      { name: 'small.txt', data: Buffer.from('tiny'), method: 0 },
    ]);
    fs.writeFileSync(file, zip);
    const r = ZipReaderNode.open(file);
    try {
      const afterOpen = r.preadBytes;
      expect(afterOpen).toBeLessThan(10_000); // EOCD tail + central directory only
      expect(r.readEntry('small.txt').toString()).toBe('tiny');
      expect(r.preadBytes - afterOpen).toBeLessThan(500);
      expect(r.size).toBe(zip.length);
    } finally {
      r.close();
    }
    expect(() => r.readEntry('small.txt')).toThrow(/closed/);
  });

  test('readRaw returns stored bytes and extras', () => {
    const r = ZipReaderNode.fromBuffer(buildZipBufferSync(members()));
    const raw = r.readRaw('a.txt');
    expect(raw.method).toBe(8);
    expect(raw.compressed.length).toBe(r.getEntry('a.txt')!.compressedSize);
    expect(raw.uncompressedSize).toBe(text.length);
    expect(getExtraField(raw.centralExtra, HDR_ID.SHA256)!.toString('hex')).toBe(sha256(text));
    expect(getExtraField(raw.localExtra, HDR_ID.SHA256)!.toString('hex')).toBe(sha256(text));

    const origin = parseOriginFromExtra(r.readRaw('wiki/parsed/p.pdf.md').centralExtra);
    expect(origin).toMatchObject({ uri: 'https://example.org/p.pdf', size: 42 });
  });

  test('tampered payload fails CRC; skipHashCheck bypasses it', () => {
    const zip = buildZipBufferSync([{ name: 'c.txt', data: Buffer.from('stored bytes'), method: 0 }]);
    const r0 = ZipReaderNode.fromBuffer(zip);
    const start = r0.getEntry('c.txt')!.localHeaderOffset + 30 + 'c.txt'.length;
    const bad = Buffer.from(zip);
    bad[start] ^= 0xff;
    const r = ZipReaderNode.fromBuffer(bad);
    let err: unknown;
    try {
      r.readEntry('c.txt');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ZipIntegrityError);
    expect((err as ZipIntegrityError).code).toBe('crc');
    expect((err as ZipIntegrityError).entry).toBe('c.txt');
    expect(r.readEntry('c.txt', { skipHashCheck: true }).length).toBe('stored bytes'.length);
  });

  test('0x014E mismatch is reported as sha256 when CRC still passes', () => {
    const zip = buildZipBufferSync([{ name: 'a.txt', data: text, method: 0, useSHA256: true }]);
    const r0 = ZipReaderNode.fromBuffer(zip);
    const e = r0.getEntry('a.txt')!;
    // Flip a bit in the stored digest (central + local copies) — payload/CRC untouched.
    const bad = Buffer.from(zip);
    let flipped = 0;
    const needle = Buffer.from(sha256(text), 'hex');
    for (let i = bad.indexOf(needle); i >= 0; i = bad.indexOf(needle, i + 1)) {
      bad[i] ^= 0x01;
      flipped++;
    }
    expect(flipped).toBe(2);
    const r = ZipReaderNode.fromBuffer(bad);
    expect(() => r.readEntry(e.name)).toThrow(expect.objectContaining({ code: 'sha256' }));
    expect(r.readEntry(e.name, { skipHashCheck: true }).equals(text)).toBe(true);
  });

  test('corrupt deflate and size mismatch map to structure / size', () => {
    const zip = buildZipBufferSync([{ name: 'a.txt', data: text, method: 8 }]);
    const r0 = ZipReaderNode.fromBuffer(zip);
    const e = r0.getEntry('a.txt')!;
    const bad = Buffer.from(zip);
    const start = e.localHeaderOffset + 30 + 'a.txt'.length;
    bad.fill(0xff, start, start + 8);
    expect(() => ZipReaderNode.fromBuffer(bad).readEntry('a.txt')).toThrow(
      expect.objectContaining({ code: 'structure' })
    );

    const stored = buildZipBufferSync([{ name: 's', data: Buffer.from('12345'), method: 0 }]);
    const sizeBad = Buffer.from(stored);
    const cdOff = sizeBad.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    sizeBad.writeUInt32LE(4, cdOff + 24); // uncompressed size in CD
    expect(() => ZipReaderNode.fromBuffer(sizeBad).readEntry('s')).toThrow(
      expect.objectContaining({ code: 'size' })
    );
  });

  test('openReadStream streams all methods and verifies at end', async () => {
    const r = ZipReaderNode.fromBuffer(buildZipBufferSync(members()));
    for (const [name, expected] of [
      ['a.txt', text],
      ['b.bin', big],
      ['c.txt', Buffer.from('stored')],
      ['empty.txt', Buffer.alloc(0)],
    ] as Array<[string, Buffer]>) {
      const chunks: Buffer[] = [];
      for await (const c of r.openReadStream(name)) chunks.push(Buffer.from(c as Buffer));
      expect(Buffer.concat(chunks).equals(expected)).toBe(true);
    }
  });

  test('openReadStream surfaces integrity errors on the stream', async () => {
    const zip = buildZipBufferSync([{ name: 'c.txt', data: Buffer.from('stored bytes'), method: 0 }]);
    const e = ZipReaderNode.fromBuffer(zip).getEntry('c.txt')!;
    const bad = Buffer.from(zip);
    bad[e.localHeaderOffset + 30 + 5] ^= 0xff;
    const stream = ZipReaderNode.fromBuffer(bad).openReadStream('c.txt');
    await expect(
      (async () => {
        for await (const _c of stream) void _c;
      })()
    ).rejects.toMatchObject({ code: 'crc' });
  });

  test('getEntry caseInsensitiveMeta finds reserved names and rejects duplicates', () => {
    const r = ZipReaderNode.fromBuffer(
      buildZipBufferSync([{ name: 'meta-inf/MANIFEST.JSON', data: Buffer.from('{}'), method: 0 }])
    );
    expect(r.getEntry('META-INF/manifest.json')).toBeNull();
    expect(r.getEntry('META-INF/manifest.json', { caseInsensitiveMeta: true })!.name).toBe(
      'meta-inf/MANIFEST.JSON'
    );

    const dup = ZipReaderNode.fromBuffer(
      buildZipBufferSync([
        { name: 'META-INF/manifest.json', data: Buffer.from('{}'), method: 0 },
        { name: 'meta-inf/Manifest.json', data: Buffer.from('{}'), method: 0 },
      ])
    );
    expect(() => dup.getEntry('META-INF/MANIFEST.JSON', { caseInsensitiveMeta: true })).toThrow(
      /case variants/
    );
  });

  test('Zip64 (forceZip64) archives parse', () => {
    const zip = buildZipBufferSync(members(), { forceZip64: true });
    const r = ZipReaderNode.fromBuffer(zip);
    expect(r.entries().length).toBe(5);
    expect(r.readEntry('a.txt').equals(text)).toBe(true);
    expect(r.readEntry('b.bin').equals(big)).toBe(true);
  });

  test('rejects non-ZIP input and closes the fd on failure', () => {
    expect(() => ZipReaderNode.fromBuffer(Buffer.from('not a zip at all, nope'))).toThrow(
      ZipIntegrityError
    );
    const f = path.join(dir, 'junk.zip');
    fs.writeFileSync(f, Buffer.alloc(100));
    expect(() => ZipReaderNode.open(f)).toThrow(/end of central directory/);
  });

  test('UTF-8 names round-trip (utf8Flag and emitUnicodePath)', () => {
    const zip = buildZipBufferSync([
      { name: 'café/日本.txt', data: Buffer.from('x'), method: 0, utf8Flag: true },
      { name: 'naïve.txt', data: Buffer.from('y'), method: 0, emitUnicodePath: true },
      { name: 'lossy-é.txt', data: Buffer.from('z'), method: 0 },
    ]);
    const r = ZipReaderNode.fromBuffer(zip);
    const names = r.entries().map((e) => e.name);
    expect(names[0]).toBe('café/日本.txt');
    expect(r.entries()[0].flags & 0x800).toBe(0x800);
    expect(names[1]).toBe('naïve.txt');
    expect(names[2]).toBe('lossy-?.txt'); // default stays ASCII-only
  });
});
