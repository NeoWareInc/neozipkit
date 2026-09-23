/**
 * Synchronous inflate for Node readers (store, raw deflate, native zstd).
 */

import { inflateRawSync } from 'zlib';
import { decompressSync } from './ZstdNode';

export function inflateZipPayloadSync(method: number, compressed: Buffer): Buffer {
  if (method === 0) {
    return Buffer.from(compressed);
  }
  if (method === 8) {
    return inflateRawSync(compressed);
  }
  if (method === 93) {
    return decompressSync(compressed);
  }
  throw new Error(`unsupported compression method ${method}`);
}
