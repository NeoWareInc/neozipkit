import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildZipBuffer,
  buildZipBufferSync,
  writeZipFile,
} from '../../../src/node/buildZipBuffer';
import { ZipReaderNode } from '../../../src/node/ZipReaderNode';
import { composeExtraFields, getExtraField, parseExtraFields } from '../../../src/core/extra';
import { makeOriginExtra } from '../../../src/core/origin/OriginExtra';
import { HDR_ID } from '../../../src/core/constants/Headers';

describe('buildZipBuffer (A3 / A6 writer options)', () => {
  test('extras are appended after additionalExtra and win on duplicate ids', () => {
    const zip = buildZipBufferSync([
      {
        name: 'x.txt',
        data: Buffer.from('x'),
        method: 0,
        additionalExtra: composeExtraFields({ id: 0x9001, data: Buffer.from('base') }, {
          id: 0x9002,
          data: Buffer.from('keep'),
        }),
        extras: [
          { id: 0x9001, data: Buffer.from('override') },
          { id: HDR_ID.ORIGIN, data: makeOriginExtra({ size: 1 }).subarray(4) },
        ],
      },
    ]);
    const r = ZipReaderNode.fromBuffer(zip);
    const extra = r.getEntry('x.txt')!.centralExtra;
    expect(parseExtraFields(extra).map((f) => f.id)).toEqual([0x9002, 0x9001, HDR_ID.ORIGIN]);
    expect(getExtraField(extra, 0x9001)!.toString()).toBe('override');
    expect(getExtraField(r.readRaw('x.txt').localExtra, 0x9002)!.toString()).toBe('keep');
  });

  test('extras apply on top of precompressed.extra; 0x014E from useSHA256 is not duplicated', () => {
    const base = ZipReaderNode.fromBuffer(
      buildZipBufferSync([{ name: 'a', data: Buffer.from('aaaa'), method: 0, useSHA256: true }])
    );
    const raw = base.readRaw('a');
    const zip = buildZipBufferSync([
      {
        name: 'a',
        precompressed: {
          method: raw.method,
          data: raw.compressed,
          crc32: raw.crc32,
          uncompressedSize: raw.uncompressedSize,
          extra: raw.centralExtra,
        },
        extras: [{ id: 0x9003, data: Buffer.from('n') }],
      },
      {
        name: 'b',
        data: Buffer.from('bbbb'),
        method: 0,
        useSHA256: true,
        extras: [{ id: HDR_ID.SHA256, data: Buffer.alloc(32, 1) }],
      },
    ]);
    const r = ZipReaderNode.fromBuffer(zip);
    const a = parseExtraFields(r.getEntry('a')!.centralExtra).map((f) => f.id);
    expect(a).toContain(HDR_ID.SHA256);
    expect(a).toContain(0x9003);
    const b = parseExtraFields(r.getEntry('b')!.centralExtra).filter((f) => f.id === HDR_ID.SHA256);
    expect(b.length).toBe(1);
    expect(r.readEntry('b').toString()).toBe('bbbb'); // real digest, not the override
  });

  test('utf8Flag writes raw UTF-8 + EFS; default stays ASCII', () => {
    const r = ZipReaderNode.fromBuffer(
      buildZipBufferSync([
        { name: 'é.txt', data: Buffer.from('1'), method: 0, utf8Flag: true },
        { name: 'é2.txt', data: Buffer.from('2'), method: 0 },
      ])
    );
    const [u, d] = r.entries();
    expect(u.name).toBe('é.txt');
    expect(u.flags & 0x800).toBe(0x800);
    expect(d.name).toBe('?2.txt');
    expect(d.flags & 0x800).toBe(0);
  });

  test('async buildZipBuffer matches the sync output and supports computeMerkle', async () => {
    const members = [{ name: 'a', data: Buffer.from('a'), method: 0 as const }];
    const sync = buildZipBufferSync(members, { computeMerkle: 'v1' });
    const viaAsync = await buildZipBuffer(members, { computeMerkle: 'v1' });
    expect(viaAsync.merkleRoot).toBe(sync.merkleRoot);
    const plain = await buildZipBuffer(members);
    expect(Buffer.isBuffer(plain)).toBe(true);
    expect(buildZipBufferSync([])).toBeInstanceOf(Buffer);
    expect(buildZipBufferSync([], { computeMerkle: 'v1' }).merkleRoot).toBeNull();
  });

  test('dataPath members are read from disk (buffer + file writers)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bzb-'));
    try {
      const src = path.join(dir, 'in.txt');
      fs.writeFileSync(src, 'from disk');
      const members = [{ name: 'in.txt', dataPath: src, method: 8 as const }];
      const r = ZipReaderNode.fromBuffer(buildZipBufferSync(members));
      expect(r.readEntry('in.txt').toString()).toBe('from disk');

      const out = path.join(dir, 'out.zip');
      await writeZipFile(out, members);
      const r2 = ZipReaderNode.open(out);
      expect(r2.readEntry('in.txt').toString()).toBe('from disk');
      r2.close();

      const merkle = buildZipBufferSync(members, { computeMerkle: 'v1' }).merkleRoot;
      const inline = buildZipBufferSync([{ name: 'in.txt', data: Buffer.from('from disk') }], {
        computeMerkle: 'v1',
      }).merkleRoot;
      expect(merkle).toBe(inline);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
