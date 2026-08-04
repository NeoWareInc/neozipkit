/**
 * Unit tests for APPNOTE §6 Merkle root (v0 / v1)
 */

import {
  normalizeMerklePath,
  leafHashV0,
  leafHashV1,
  parentHash,
  merkleRootFromLeaves,
  computeArchiveMerkleRoot,
  computeMerkleRootV0FromDigests,
  computeMerkleRootV1FromContents,
  matchMerkleRoot,
  contentDigest,
} from '../../../../src/core/merkle/MerkleRoot';
import { createHash } from 'crypto';

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
}

describe('MerkleRoot (APPNOTE §6)', () => {
  describe('normalizeMerklePath', () => {
    it('converts backslashes, strips ./ and leading /, NFC', () => {
      expect(normalizeMerklePath('foo\\bar')).toBe('foo/bar');
      expect(normalizeMerklePath('./a/b')).toBe('a/b');
      expect(normalizeMerklePath('/a/b')).toBe('a/b');
      // composed vs decomposed é
      const nfc = 'café';
      const nfd = 'cafe\u0301';
      expect(normalizeMerklePath(nfd)).toBe(nfc.normalize('NFC'));
    });
  });

  describe('v1 single-leaf tree', () => {
    it('root equals domain-separated leaf, not bare 0x014E', () => {
      const content = Buffer.from('hello world');
      const bare = contentDigest(content);
      const leaf = leafHashV1(content);
      const root = computeMerkleRootV1FromContents([{ path: 'hello.txt', content }]);

      expect(bare.toString('hex')).not.toBe(leaf.toString('hex'));
      expect(root).toBe(leaf.toString('hex'));
      expect(root).not.toBe(bare.toString('hex'));
    });
  });

  describe('v0 single-leaf tree', () => {
    it('root equals bare content digest (0x014E)', () => {
      const content = Buffer.from('hello world');
      const bare = contentDigest(content);
      const root = computeArchiveMerkleRoot(
        [{ path: 'hello.txt', contentSha256: bare.toString('hex') }],
        'v0'
      );
      expect(root).toBe(bare.toString('hex'));
    });
  });

  describe('v1 two leaves', () => {
    it('uses parent domain 0x01 and path-normalized sort order', () => {
      const a = Buffer.from('aaa');
      const b = Buffer.from('bbb');
      const leafA = leafHashV1(a);
      const leafB = leafHashV1(b);
      // Normalized paths: "a.txt" < "b.txt" in UTF-8
      const root = computeMerkleRootV1FromContents([
        { path: 'b.txt', content: b },
        { path: './a.txt', content: a },
      ]);

      const expected = parentHash(leafA, leafB, 'v1').toString('hex');
      expect(root).toBe(expected);
      expect(root).toBe(sha256(Buffer.from([0x01]), leafA, leafB).toString('hex'));
    });
  });

  describe('v1 odd leaf promotion', () => {
    it('promotes the last node without self-hashing', () => {
      const c1 = Buffer.from('1');
      const c2 = Buffer.from('2');
      const c3 = Buffer.from('3');
      const l1 = leafHashV1(c1);
      const l2 = leafHashV1(c2);
      const l3 = leafHashV1(c3);
      // paths sort as a,b,c
      const root = computeMerkleRootV1FromContents([
        { path: 'a', content: c1 },
        { path: 'b', content: c2 },
        { path: 'c', content: c3 },
      ]);
      const mid = parentHash(l1, l2, 'v1');
      // odd: l3 promoted, then parent(mid, l3)
      const expected = parentHash(mid, l3, 'v1').toString('hex');
      expect(root).toBe(expected);
    });
  });

  describe('v0 odd leaf duplication', () => {
    it('duplicates last leaf Bitcoin-style', () => {
      const d1 = Buffer.alloc(32, 0x01);
      const d2 = Buffer.alloc(32, 0x02);
      const d3 = Buffer.alloc(32, 0x03);
      const root = computeMerkleRootV0FromDigests([
        { path: 'a', sha256: d1 },
        { path: 'b', sha256: d2 },
        { path: 'c', sha256: d3 },
      ]);
      const mid = parentHash(d1, d2, 'v0');
      const lastPair = parentHash(d3, d3, 'v0');
      const expected = parentHash(mid, lastPair, 'v0').toString('hex');
      expect(root).toBe(expected);
    });
  });

  describe('excludes META-INF', () => {
    it('ignores meta entries regardless of algorithm', () => {
      const content = Buffer.from('x');
      const root = computeArchiveMerkleRoot(
        [
          { path: 'META-INF/TOKEN.NZIP', content },
          { path: 'data.bin', content },
        ],
        'v1'
      );
      expect(root).toBe(leafHashV1(content).toString('hex'));
    });
  });

  describe('matchMerkleRoot §6.4', () => {
    it('prefers v1 when content matches', () => {
      const content = Buffer.from('payload');
      const root = computeMerkleRootV1FromContents([{ path: 'f', content }])!;
      const m = matchMerkleRoot([{ path: 'f', content }], root);
      expect(m).toEqual({ algorithm: 'v1', security: 'high' });
    });

    it('falls back to v0 digests', () => {
      const content = Buffer.from('payload');
      const dig = contentDigest(content);
      const root = dig.toString('hex');
      const m = matchMerkleRoot(
        [{ path: 'f', contentSha256: dig.toString('hex') }],
        root
      );
      expect(m).toEqual({ algorithm: 'v0', security: 'legacy' });
    });
  });

  describe('v1 must not use raw 0x014E as leaf', () => {
    it('leaves differ from parent of raw digests', () => {
      const c1 = Buffer.from('alpha');
      const c2 = Buffer.from('beta');
      const d1 = contentDigest(c1);
      const d2 = contentDigest(c2);
      const v1 = computeMerkleRootV1FromContents([
        { path: 'a', content: c1 },
        { path: 'b', content: c2 },
      ]);
      // Wrong construction: tree of bare digests with v1 parents
      const wrong = merkleRootFromLeaves([d1, d2], 'v1');
      expect(v1).not.toBe(wrong);
      // Wrong: bare digests as leaves without domain
      expect(v1).not.toBe(merkleRootFromLeaves([d1, d2], 'v0'));
    });
  });

  describe('leafHashV0', () => {
    it('hashes content or passes digest', () => {
      const content = Buffer.from('z');
      const d = contentDigest(content);
      expect(leafHashV0(content).equals(d)).toBe(true);
      expect(leafHashV0(d, true).equals(d)).toBe(true);
    });
  });
});
