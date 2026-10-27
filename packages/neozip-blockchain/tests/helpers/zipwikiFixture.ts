/**
 * ZipWiki-shaped test archive built with neozipkit's `buildZipBufferSync`:
 *
 *   META-INF/manifest.json        (stored; createManifest + `ai` stub)
 *   wiki/parsed/doc.txt.md        (zstd, with Extra Field 0x014F)
 *   doc.txt                       (zstd)
 *
 * No 0x014E digests are written (the Merkle root comes from the payloads).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildZipBufferSync,
  createManifest,
  serializeManifest,
  makeOriginExtra,
  computeMerkleRootFromReader,
  ZipReaderNode,
  type ZipBufferMember,
} from 'neozipkit/node';

export const DOC_TEXT = Buffer.from('ZipWiki fixture document.\n'.repeat(200), 'utf8');
export const PARSED_TEXT = Buffer.from('# doc.txt\n\n' + 'Parsed ZipWiki fixture line.\n'.repeat(200), 'utf8');

export interface FixtureOptions {
  /** Replace the body of `doc.txt` (changes the Merkle root). */
  docText?: Buffer;
  /** Leave out manifest.json. */
  noManifest?: boolean;
  /** Store content uncompressed instead of zstd. */
  stored?: boolean;
}

export function buildZipwikiFixture(opts: FixtureOptions = {}): Buffer {
  const method = opts.stored ? 0 : 93;
  const members: ZipBufferMember[] = [];

  if (!opts.noManifest) {
    const manifest = {
      ...createManifest({ specVersion: '0.3.0', profiles: ['zipwiki'] }),
      ai: {
        root: 'wiki',
        parsedDir: 'parsed',
        primaries: [{ path: 'doc.txt', sourceIncluded: true }],
      },
    };
    members.push({
      name: 'META-INF/manifest.json',
      data: Buffer.from(serializeManifest(manifest), 'utf8'),
      method: 0,
    });
  }

  const doc = opts.docText ?? DOC_TEXT;
  members.push({
    name: 'wiki/parsed/doc.txt.md',
    data: PARSED_TEXT,
    method,
    additionalExtra: makeOriginExtra({ uri: 'file:///fixture/doc.txt', size: doc.length }),
  });
  members.push({ name: 'doc.txt', data: doc, method });

  return buildZipBufferSync(members);
}

/**
 * Two-leaf batch tree (OpenZeppelin sorted-pair keccak256) so `merkleProof`
 * verifies with `verifyMerkleProofLocal`.
 */
export function makeBatchProof(digest: string): { batchMerkleRoot: string; merkleProof: string[] } {
  // Loaded lazily so tests that mock `ethers` still get the real helpers.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ethers } = jest.requireActual('ethers') as typeof import('ethers');
  const leaf = '0x' + digest;
  const sibling = ethers.keccak256(ethers.toUtf8Bytes('sibling:' + digest));
  const [a, b] = Buffer.compare(Buffer.from(ethers.getBytes(leaf)), Buffer.from(ethers.getBytes(sibling))) <= 0
    ? [leaf, sibling]
    : [sibling, leaf];
  const batchMerkleRoot = ethers.keccak256(ethers.concat([a, b]));
  return { batchMerkleRoot, merkleProof: [sibling] };
}

export function tmpArchive(buf: Buffer, name = 'fixture.zipwiki'): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neozip-blockchain-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, buf);
  return { dir, file };
}

export function rmTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** v1 Merkle root of the archive at `file`. */
export async function rootOf(file: string): Promise<string> {
  const reader = ZipReaderNode.open(file);
  try {
    const root = await computeMerkleRootFromReader(reader);
    if (!root) throw new Error('no merkle root');
    return root;
  } finally {
    reader.close();
  }
}

export function entryNames(file: string): string[] {
  const reader = ZipReaderNode.open(file);
  try {
    return reader.entries().map((e) => e.name);
  } finally {
    reader.close();
  }
}

export function readText(file: string, name: string): string {
  const reader = ZipReaderNode.open(file);
  try {
    return reader.readEntry(name).toString('utf8');
  } finally {
    reader.close();
  }
}
