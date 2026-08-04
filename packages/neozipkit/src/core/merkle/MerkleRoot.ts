// ======================================
//  MerkleRoot.ts — NeoZip APPNOTE §6
//  v0 (legacy Bitcoin-style) and v1 (RFC 6962–style domain separation)
// ======================================

import * as crypto from 'crypto';
import { isMetaInfPath } from '../constants/MetaPaths';

/** Merkle algorithms defined in NEOZIP_APPNOTE.md §6. */
export type MerkleAlgorithm = 'v0' | 'v1';

export interface MerkleContentEntry {
  /** Central-directory path (UTF-8 string as stored or as known to the writer). */
  path: string;
  /**
   * Uncompressed payload bytes (same bytes hashed into Extra Field 0x014E).
   * Required for **v1** leaves. Optional for **v0** when `contentSha256` is set.
   */
  content?: Buffer | Uint8Array;
  /**
   * Bare SHA-256 of uncompressed payload (= Extra Field 0x014E), hex or 32-byte Buffer.
   * Used as v0 leaf; for v1 this alone is **not** a leaf (see APPNOTE §6.3).
   */
  contentSha256?: string | Buffer;
}

const LEAF_DOMAIN = Buffer.from([0x00]);
const NODE_DOMAIN = Buffer.from([0x01]);

function sha256(data: Buffer | Uint8Array | Buffer[]): Buffer {
  const h = crypto.createHash('sha256');
  if (Array.isArray(data)) {
    for (const part of data) {
      h.update(part);
    }
  } else {
    h.update(data);
  }
  return h.digest();
}

function asBuffer(data: Buffer | Uint8Array | string, encoding?: BufferEncoding): Buffer {
  if (typeof data === 'string') {
    return Buffer.from(data, encoding ?? 'hex');
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Normalize a ZIP entry path for v1 leaf ordering (APPNOTE §6.3):
 * POSIX separators, strip leading `./` and `/`, Unicode NFC, UTF-8 byte order when compared.
 */
export function normalizeMerklePath(path: string): string {
  let p = path.replace(/\\/g, '/');
  if (p.startsWith('./')) {
    p = p.slice(2);
  }
  while (p.startsWith('/')) {
    p = p.slice(1);
  }
  if (typeof p.normalize === 'function') {
    p = p.normalize('NFC');
  }
  return p;
}

/** Sort key for path comparison (UTF-8 byte order). */
function pathSortKey(path: string, algorithm: MerkleAlgorithm): Buffer {
  const normalized = algorithm === 'v1' ? normalizeMerklePath(path) : path;
  return Buffer.from(normalized, 'utf8');
}

/** Bare content digest (= 0x014E value). */
export function contentDigest(content: Buffer | Uint8Array): Buffer {
  return sha256(asBuffer(content));
}

/**
 * v0 leaf: SHA-256(uncompressed bytes) — same as Extra Field 0x014E.
 */
export function leafHashV0(contentOrDigest: Buffer | Uint8Array, isDigest = false): Buffer {
  const buf = asBuffer(contentOrDigest);
  return isDigest ? buf : sha256(buf);
}

/**
 * v1 leaf: SHA-256(0x00 ‖ uncompressed_bytes).
 * Must not be confused with the bare 0x014E digest (APPNOTE §6.3).
 */
export function leafHashV1(content: Buffer | Uint8Array): Buffer {
  return sha256([LEAF_DOMAIN, asBuffer(content)]);
}

/**
 * Parent node hashes.
 * v0: SHA-256(H_left ‖ H_right) — order preserved, no pair sorting.
 * v1: SHA-256(0x01 ‖ H_left ‖ H_right).
 */
export function parentHash(left: Buffer, right: Buffer, algorithm: MerkleAlgorithm): Buffer {
  if (algorithm === 'v1') {
    return sha256([NODE_DOMAIN, left, right]);
  }
  return sha256([left, right]);
}

/**
 * Fold an ordered list of leaf hashes into a single root (hex lowercase).
 * Odd-count rule:
 *  - v0: duplicate last leaf (Bitcoin-style)
 *  - v1: promote last node unhashed (RFC 6962–style)
 */
export function merkleRootFromLeaves(leaves: Buffer[], algorithm: MerkleAlgorithm): string | null {
  if (leaves.length === 0) {
    return null;
  }

  let level: Buffer[] = leaves.map((l) => Buffer.from(l));

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(parentHash(level[i], level[i + 1], algorithm));
    }
    if (level.length % 2 === 1) {
      const last = level[level.length - 1];
      if (algorithm === 'v0') {
        // Duplicate last leaf, then hash the pair
        next.push(parentHash(last, last, algorithm));
      } else {
        // Promote unhashed
        next.push(last);
      }
    }
    level = next;
  }

  return level[0].toString('hex');
}

function resolveLeaf(
  entry: MerkleContentEntry,
  algorithm: MerkleAlgorithm
): Buffer | null {
  if (algorithm === 'v0') {
    if (entry.contentSha256) {
      const d = asBuffer(entry.contentSha256, typeof entry.contentSha256 === 'string' ? 'hex' : undefined);
      if (d.length !== 32) {
        return null;
      }
      return d;
    }
    if (entry.content) {
      return contentDigest(entry.content);
    }
    return null;
  }

  // v1: domain-separated hash of uncompressed payload only
  if (entry.content) {
    return leafHashV1(entry.content);
  }
  return null;
}

/**
 * Compute archive Merkle root per APPNOTE §6 from content entries
 * (caller already excluded META-INF/** if desired).
 *
 * @returns lowercase hex root, or null if no usable leaves
 */
export function computeArchiveMerkleRoot(
  entries: MerkleContentEntry[],
  algorithm: MerkleAlgorithm = 'v1'
): string | null {
  const prepared: { key: Buffer; leaf: Buffer }[] = [];

  for (const entry of entries) {
    if (isMetaInfPath(entry.path || '')) {
      continue;
    }
    const leaf = resolveLeaf(entry, algorithm);
    if (!leaf) {
      continue;
    }
    prepared.push({
      key: pathSortKey(entry.path || '', algorithm),
      leaf,
    });
  }

  if (prepared.length === 0) {
    return null;
  }

  prepared.sort((a, b) => Buffer.compare(a.key, b.key));
  return merkleRootFromLeaves(
    prepared.map((p) => p.leaf),
    algorithm
  );
}

/**
 * Build v0 root from path + bare content digests only (0x014E extras).
 * Path order: central-directory bytes as stored (no NFC / strip).
 */
export function computeMerkleRootV0FromDigests(
  entries: Array<{ path: string; sha256: string | Buffer }>
): string | null {
  return computeArchiveMerkleRoot(
    entries.map((e) => ({ path: e.path, contentSha256: e.sha256 })),
    'v0'
  );
}

/**
 * Build v1 root from path + uncompressed payloads (APPNOTE §6.3).
 * Paths are normalized before sorting.
 */
export function computeMerkleRootV1FromContents(
  entries: Array<{ path: string; content: Buffer | Uint8Array }>
): string | null {
  return computeArchiveMerkleRoot(
    entries.map((e) => ({ path: e.path, content: e.content })),
    'v1'
  );
}

/**
 * Verify a declared root (APPNOTE §6.4): try v1 first (when content available),
 * then v0 digests. Returns which algorithm matched, or null on failure.
 *
 * When only digests are available, only v0 can be tried for a correct APPNOTE match.
 * Pass contents for full v1 verification.
 */
export function matchMerkleRoot(
  entries: MerkleContentEntry[],
  declaredRoot: string
): { algorithm: MerkleAlgorithm; security: 'high' | 'legacy' } | null {
  const expected = declaredRoot.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return null;
  }

  const hasContent = entries.some((e) => e.content && !isMetaInfPath(e.path || ''));
  if (hasContent) {
    const v1 = computeArchiveMerkleRoot(entries, 'v1');
    if (v1 && v1 === expected) {
      return { algorithm: 'v1', security: 'high' };
    }
  }

  const v0 = computeArchiveMerkleRoot(entries, 'v0');
  if (v0 && v0 === expected) {
    return { algorithm: 'v0', security: 'legacy' };
  }

  // If v1 was not tried (no content), try building v0-only already done.
  // When content available, v1 already tried; also try v1 root mismatch then v0.
  if (hasContent) {
    // already tried both
    return null;
  }

  return null;
}

export default {
  normalizeMerklePath,
  contentDigest,
  leafHashV0,
  leafHashV1,
  parentHash,
  merkleRootFromLeaves,
  computeArchiveMerkleRoot,
  computeMerkleRootV0FromDigests,
  computeMerkleRootV1FromContents,
  matchMerkleRoot,
};
