/**
 * Shared helpers for the archive flows: Merkle root resolution and reading the
 * Token Service sidecars through `ZipReaderNode` (no `ZipkitLike` needed).
 */

import { ZipReaderNode, computeMerkleRootFromReader } from 'neozipkit/node';
import {
  TS_SUBMIT_NZIP,
  TIMESTAMP_NZIP,
  TOKEN_NZIP,
  TOKEN_NZIP_LEGACY,
} from '../constants/metadata';
import type { TimestampMetadata } from '../token-service/TokenServiceHelpers';

export type SidecarKind = 'none' | 'submit' | 'timestamp' | 'token';

/** Parsed sidecars found in an archive (absent keys = not present). */
export interface ArchiveSidecars {
  submit?: TimestampMetadata;
  timestamp?: TimestampMetadata;
  /** Parsed `TOKEN.NZIP` (or legacy `NZIP.TOKEN`). Shape depends on the minter. */
  token?: Record<string, any>;
  /** Raw bytes of the token sidecar (for `ZipkitVerifier.extractTokenMetadata`). */
  tokenBytes?: Buffer;
}

const HEX64 = /^[a-f0-9]{64}$/;

/** Lowercase, strip `0x`. Throws when the result is not a 64-char hex digest. */
export function normalizeRoot(root: string, label = 'merkleRoot'): string {
  const n = String(root ?? '').trim().toLowerCase().replace(/^0x/, '');
  if (!HEX64.test(n)) {
    throw new Error(`${label} must be a 64-character hex string (SHA-256)`);
  }
  return n;
}

/** Same as {@link normalizeRoot} but returns `null` instead of throwing. */
export function tryNormalizeRoot(root: unknown): string | null {
  if (typeof root !== 'string') return null;
  const n = root.trim().toLowerCase().replace(/^0x/, '');
  return HEX64.test(n) ? n : null;
}

/**
 * v1 Merkle root over every non-`META-INF/` member (APPNOTE §6/§7).
 * Throws when the archive has no content members or a member fails integrity.
 */
export async function computeRoot(reader: ZipReaderNode): Promise<string> {
  const root = await computeMerkleRootFromReader(reader);
  if (!root) {
    throw new Error('Archive has no content members; cannot compute a Merkle root');
  }
  return root.toLowerCase();
}

/**
 * The caller's precomputed root when given (validated), otherwise computed
 * from the archive at `path` via `ZipReaderNode`.
 */
export async function resolveMerkleRoot(path: string, provided?: string): Promise<string> {
  if (provided !== undefined && provided !== null && provided !== '') {
    return normalizeRoot(provided);
  }
  const reader = ZipReaderNode.open(path);
  try {
    return await computeRoot(reader);
  } finally {
    reader.close();
  }
}

function parseJson<T>(reader: ZipReaderNode, name: string): { value: T; bytes: Buffer } | null {
  const entry = reader.getEntry(name, { caseInsensitiveMeta: true });
  if (!entry) return null;
  const bytes = reader.readEntry(entry);
  try {
    return { value: JSON.parse(bytes.toString('utf8')) as T, bytes };
  } catch (err) {
    throw new Error(`${name}: invalid JSON (${(err as Error).message})`);
  }
}

/** Read and parse `TS-SUBMIT`, `TIMESTAMP` and `TOKEN` (legacy `NZIP.TOKEN` accepted). */
export function readSidecars(reader: ZipReaderNode): ArchiveSidecars {
  const out: ArchiveSidecars = {};
  const submit = parseJson<TimestampMetadata>(reader, TS_SUBMIT_NZIP);
  if (submit) out.submit = submit.value;
  const timestamp = parseJson<TimestampMetadata>(reader, TIMESTAMP_NZIP);
  if (timestamp) out.timestamp = timestamp.value;
  const token =
    parseJson<Record<string, any>>(reader, TOKEN_NZIP) ??
    parseJson<Record<string, any>>(reader, TOKEN_NZIP_LEGACY);
  if (token) {
    out.token = token.value;
    out.tokenBytes = token.bytes;
  }
  return out;
}

/** Open `path`, read sidecars, close. */
export function readSidecarsFromPath(path: string): ArchiveSidecars {
  const reader = ZipReaderNode.open(path);
  try {
    return readSidecars(reader);
  } finally {
    reader.close();
  }
}

/** Highest-precedence sidecar present: token > timestamp > submit (§8.4). */
export function sidecarKind(s: ArchiveSidecars): SidecarKind {
  if (s.token) return 'token';
  if (s.timestamp) return 'timestamp';
  if (s.submit) return 'submit';
  return 'none';
}

/** Declared root of a sidecar (`merkleRoot` for tokens, `digest` otherwise). */
export function declaredRoot(kind: SidecarKind, s: ArchiveSidecars): string | null {
  switch (kind) {
    case 'token':
      return tryNormalizeRoot(s.token?.merkleRoot) ?? tryNormalizeRoot(s.token?.timestampProof?.digest);
    case 'timestamp':
      return tryNormalizeRoot(s.timestamp?.digest);
    case 'submit':
      return tryNormalizeRoot(s.submit?.digest);
    default:
      return null;
  }
}
