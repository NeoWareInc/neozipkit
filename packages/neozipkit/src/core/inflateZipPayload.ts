/**
 * Inflate one ZIP member payload (store, deflate, zstd) from an in-memory buffer.
 * Browser bundles alias ZstdNode to the CompressionStream codec.
 */

import pako from 'pako';
import { decompress } from '../node/ZstdNode';

export async function inflateZipPayload(
  method: number,
  compressed: Uint8Array | ArrayBuffer,
): Promise<Uint8Array> {
  const bytes =
    compressed instanceof ArrayBuffer ? new Uint8Array(compressed) : compressed;
  if (method === 0) {
    return bytes.slice();
  }
  if (method === 8) {
    const out = pako.inflateRaw(bytes);
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  if (method === 93) {
    const out = await decompress(bytes);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  throw new Error(`unsupported compression method ${method}`);
}
