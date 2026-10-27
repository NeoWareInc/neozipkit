import { buildZipBufferSync, type ZipBufferMember } from '../../../src/node/buildZipBuffer';
import { ZipReaderNode, ZipIntegrityError } from '../../../src/node/ZipReaderNode';
import { computeMerkleRoot, matchMerkleRoot } from '../../../src/node/merkleFromReader';
import { matchMerkleRoot as matchCore, computeArchiveMerkleRoot } from '../../../src/core/merkle/MerkleRoot';

const content: ZipBufferMember[] = [
  { name: 'b.txt', data: Buffer.from('bravo'), method: 8, useSHA256: true },
  { name: 'a.txt', data: Buffer.from('alpha'), method: 0, useSHA256: true },
  { name: 'dir/c.txt', data: Buffer.from('charlie'), method: 0, useSHA256: true },
];
const meta: ZipBufferMember = { name: 'META-INF/manifest.json', data: Buffer.from('{}'), method: 0 };

describe('merkle from reader', () => {
  test('v1 matches the writer-side root and ignores META-INF', async () => {
    const built = buildZipBufferSync([...content, meta], { computeMerkle: 'v1' });
    expect(built.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    const r = ZipReaderNode.fromBuffer(built.buffer);
    expect(await computeMerkleRoot(r)).toBe(built.merkleRoot);
    expect(await computeMerkleRoot(r, { algorithm: 'v1' })).toBe(built.merkleRoot);

    const withoutMeta = ZipReaderNode.fromBuffer(buildZipBufferSync(content));
    expect(await computeMerkleRoot(withoutMeta)).toBe(built.merkleRoot);

    expect(await matchMerkleRoot(r, built.merkleRoot!)).toEqual({ algorithm: 'v1', security: 'high' });
    expect(await matchMerkleRoot(r, '0x' + built.merkleRoot!.toUpperCase())).toEqual({
      algorithm: 'v1',
      security: 'high',
    });
    expect(await matchMerkleRoot(r, 'f'.repeat(64))).toBeNull();
  });

  test('v0 uses 0x014E digests and matches as legacy', async () => {
    const built = buildZipBufferSync(content, { computeMerkle: 'v0' });
    const r = ZipReaderNode.fromBuffer(built.buffer);
    const v0 = await computeMerkleRoot(r, { algorithm: 'v0' });
    expect(v0).toBe(built.merkleRoot);
    expect(v0).not.toBe(await computeMerkleRoot(r, { algorithm: 'v1' }));
    expect(await matchMerkleRoot(r, v0!)).toEqual({ algorithm: 'v0', security: 'legacy' });
  });

  test('v0 skips members without 0x014E; v1 still covers them', async () => {
    const mixed = buildZipBufferSync([
      { name: 'a.txt', data: Buffer.from('alpha'), method: 0, useSHA256: true },
      { name: 'b.txt', data: Buffer.from('bravo'), method: 0 },
    ]);
    const r = ZipReaderNode.fromBuffer(mixed);
    const onlyA = computeArchiveMerkleRoot(
      [{ path: 'a.txt', content: Buffer.from('alpha') }],
      'v0'
    );
    expect(await computeMerkleRoot(r, { algorithm: 'v0' })).toBe(onlyA);
    // Legacy writers' roots (digest-bearing members only) still verify.
    expect(await matchMerkleRoot(r, onlyA!)).toEqual({ algorithm: 'v0', security: 'legacy' });
  });

  test('agrees with the core matcher over the same entries', async () => {
    const built = buildZipBufferSync(content, { computeMerkle: 'v1' });
    const core = matchCore(
      content.map((m) => ({ path: m.name, content: m.data })),
      built.merkleRoot!
    );
    const r = ZipReaderNode.fromBuffer(built.buffer);
    expect(await matchMerkleRoot(r, built.merkleRoot!)).toEqual(core);
  });

  test('returns null for archives with no content; integrity errors propagate', async () => {
    const onlyMeta = ZipReaderNode.fromBuffer(buildZipBufferSync([meta]));
    expect(await computeMerkleRoot(onlyMeta)).toBeNull();

    const zip = buildZipBufferSync([{ name: 'a.txt', data: Buffer.from('alpha'), method: 0 }]);
    const e = ZipReaderNode.fromBuffer(zip).getEntry('a.txt')!;
    const bad = Buffer.from(zip);
    bad[e.localHeaderOffset + 30 + 5] ^= 0xff;
    await expect(computeMerkleRoot(ZipReaderNode.fromBuffer(bad))).rejects.toBeInstanceOf(
      ZipIntegrityError
    );
  });

  test('precompressed members inflate for v1 and reuse 0x014E for v0 in the writer', () => {
    const base = buildZipBufferSync(content);
    const r = ZipReaderNode.fromBuffer(base);
    const copied: ZipBufferMember[] = r.entries().map((e) => {
      const raw = r.readRaw(e);
      return {
        name: e.name,
        precompressed: {
          method: raw.method,
          data: raw.compressed,
          crc32: raw.crc32,
          uncompressedSize: raw.uncompressedSize,
          extra: raw.centralExtra,
        },
      };
    });
    const direct = buildZipBufferSync(content, { computeMerkle: 'v1' }).merkleRoot;
    expect(buildZipBufferSync(copied, { computeMerkle: 'v1' }).merkleRoot).toBe(direct);
    expect(buildZipBufferSync(copied, { computeMerkle: 'v0' }).merkleRoot).toBe(
      buildZipBufferSync(content, { computeMerkle: 'v0' }).merkleRoot
    );
  });
});
