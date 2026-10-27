// ======================================
//  merkleFromReader.ts — APPNOTE §6/§7 Merkle root over a ZipReaderNode
// ======================================

import { HDR_ID } from '../core/constants/Headers';
import { isMetaInfPath } from '../core/constants/MetaPaths';
import { getExtraField } from '../core/extra';
import {
  computeArchiveMerkleRoot,
  matchMerkleRoot as matchMerkleRootCore,
  type MerkleAlgorithm,
  type MerkleContentEntry,
} from '../core/merkle/MerkleRoot';
import type { ZipReaderNode } from './ZipReaderNode';

function contentEntries(reader: ZipReaderNode) {
  return reader.entries().filter((e) => !isMetaInfPath(e.name));
}

function digestOf(entry: { centralExtra: Buffer }): Buffer | null {
  const d = getExtraField(entry.centralExtra, HDR_ID.SHA256);
  return d && d.length === 32 ? d : null;
}

/**
 * Merkle root over every non-`META-INF/` member (APPNOTE §6).
 *
 * - `v1` (default): inflates and verifies each member via `readEntry`, then hashes
 *   `SHA-256(0x00 ‖ bytes)` leaves.
 * - `v0`: uses the declared `0x014E` digests only (no inflate); members without one
 *   are skipped, matching `Zipkit.getMerkleRoot({ algorithm: 'v0' })`.
 *
 * Returns null when there are no usable leaves. Throws {@link ZipIntegrityError}
 * if a member fails its CRC / size / 0x014E check while being read.
 */
export async function computeMerkleRoot(
  reader: ZipReaderNode,
  options?: { algorithm?: MerkleAlgorithm }
): Promise<string | null> {
  const algorithm = options?.algorithm ?? 'v1';
  const entries: MerkleContentEntry[] = [];
  for (const e of contentEntries(reader)) {
    if (algorithm === 'v0') {
      const d = digestOf(e);
      if (d) entries.push({ path: e.name, contentSha256: d });
    } else {
      entries.push({ path: e.name, content: await reader.readEntryAsync(e) });
    }
  }
  return computeArchiveMerkleRoot(entries, algorithm);
}

/**
 * Verify a declared root (APPNOTE §6.4): try v1 over the real payloads, then v0
 * over the `0x014E` digests. Returns the algorithm that matched, or null.
 */
export async function matchMerkleRoot(
  reader: ZipReaderNode,
  declaredRoot: string
): Promise<{ algorithm: MerkleAlgorithm; security: 'high' | 'legacy' } | null> {
  const entries: MerkleContentEntry[] = [];
  const v0Entries: MerkleContentEntry[] = [];
  for (const e of contentEntries(reader)) {
    const content = await reader.readEntryAsync(e);
    entries.push({ path: e.name, content });
    const d = digestOf(e);
    if (d) v0Entries.push({ path: e.name, contentSha256: d });
  }
  // Core tries v1 over payloads, then v0 over digests of the same members.
  const hit = matchMerkleRootCore(entries, declaredRoot);
  if (hit) return hit;
  // Legacy writers (Zipkit.getMerkleRoot v0) only include members that carry 0x014E.
  return matchMerkleRootCore(v0Entries, declaredRoot);
}
