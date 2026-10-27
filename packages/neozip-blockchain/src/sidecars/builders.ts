/**
 * Pure sidecar builders (APPNOTE §8): JSON UTF-8 bytes for the Token Service
 * sidecars under `META-INF/`. No ZIP I/O and no neozipkit import, so this
 * module is safe to load from any entry point.
 */

import { TS_SUBMIT_NZIP, TIMESTAMP_NZIP, TOKEN_NZIP } from '../constants/metadata';

/** A `META-INF/` member ready for `applyMetaSidecars` / {@link writeSidecars}. */
export interface Sidecar {
  /** Full archive path, e.g. `META-INF/TS-SUBMIT.NZIP`. */
  name: string;
  /** JSON, UTF-8 (two-space indent, trailing newline). */
  bytes: Buffer;
}

function encode(name: string, meta: object): Sidecar {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error(`${name}: metadata must be a JSON object`);
  }
  return { name, bytes: Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf8') };
}

/** `META-INF/TS-SUBMIT.NZIP` — pending Token Service submission. */
export function buildSubmitSidecar(meta: object): Sidecar {
  return encode(TS_SUBMIT_NZIP, meta);
}

/** `META-INF/TIMESTAMP.NZIP` — confirmed timestamp proof. */
export function buildTimestampSidecar(meta: object): Sidecar {
  return encode(TIMESTAMP_NZIP, meta);
}

/** `META-INF/TOKEN.NZIP` — on-chain token bound to the Merkle root. */
export function buildTokenSidecar(meta: object): Sidecar {
  return encode(TOKEN_NZIP, meta);
}
