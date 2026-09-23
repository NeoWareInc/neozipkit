/**
 * Browser zstd codec for in-memory buffers.
 * Uses CompressionStream / DecompressionStream ('zstd') so the old WASM codec stays out.
 * Node builds use src/node/ZstdNode.ts (native zlib) instead of this file.
 */

import { Buffer } from 'buffer';

/** Bytes accepted by the buffer zstd codec. */
export type ZstdInput = Buffer | Uint8Array | ArrayBuffer;

const ZSTD_UNAVAILABLE =
  'This browser does not expose CompressionStream zstd. ' +
  'Use a current Chromium or Safari, or inflate the archive in Node.';

function asBytes(data: ZstdInput): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

export function isNativeZstdAvailable(): boolean {
  try {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
      return false;
    }
    // 'zstd' is not in the older CompressionFormat union.
    new CompressionStream('zstd' as CompressionFormat);
    new DecompressionStream('zstd' as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

export function mapCompressionLevel(level: number): number {
  return Math.min(Math.max(1, Math.floor(level * 2.1)), 19);
}

function assertZstd(): void {
  if (!isNativeZstdAvailable()) {
    throw new Error(ZSTD_UNAVAILABLE);
  }
}

async function transformZstd(data: Uint8Array, mode: 'compress' | 'decompress'): Promise<Uint8Array> {
  assertZstd();
  const Stream = mode === 'compress' ? CompressionStream : DecompressionStream;
  const stream = new Stream('zstd' as CompressionFormat);
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const writer = stream.writable.getWriter();
  await writer.write(copy);
  await writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createCompressTransform(_level?: number): never {
  throw new Error('Browser zstd uses buffer compress(); Node zlib transforms are not available.');
}

export function createDecompressTransform(): never {
  throw new Error('Browser zstd uses buffer decompress(); Node zlib transforms are not available.');
}

export async function compress(data: ZstdInput, _level?: number): Promise<Buffer> {
  return toBuffer(await transformZstd(asBytes(data), 'compress'));
}

export async function decompress(data: ZstdInput): Promise<Buffer> {
  return toBuffer(await transformZstd(asBytes(data), 'decompress'));
}

export function compressSync(_data: ZstdInput, _level?: number): Buffer {
  throw new Error('Browser zstd compress is async. Use compress().');
}

export function compressSyncAtLevel(data: ZstdInput, _zstdLevel?: number): Buffer {
  return compressSync(data);
}

export function decompressSync(_data: ZstdInput): Buffer {
  throw new Error('Browser zstd decompress is async. Use decompress().');
}

export function asZstdBuffer(data: ZstdInput): Buffer {
  return toBuffer(asBytes(data));
}

export async function compressChunks(
  readChunk: (position: number, size: number) => Buffer,
  totalSize: number,
  chunkSize: number,
  level: number,
  _onPlainChunk?: (chunk: Buffer) => void,
  onCompressedChunk?: (chunk: Buffer) => void | Promise<void>
): Promise<number> {
  const parts: Buffer[] = [];
  let position = 0;
  while (position < totalSize) {
    const size = Math.min(chunkSize, totalSize - position);
    const chunk = readChunk(position, size);
    parts.push(Buffer.from(chunk));
    position += chunk.length;
  }
  const compressed = await compress(Buffer.concat(parts), level);
  if (onCompressedChunk) {
    await onCompressedChunk(compressed);
  }
  return compressed.length;
}

export async function* decompressStream(
  compressedStream: AsyncIterable<Buffer>
): AsyncGenerator<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of compressedStream) {
    parts.push(Buffer.from(chunk));
  }
  yield await decompress(Buffer.concat(parts));
}

export const ZstdNode = {
  isNativeZstdAvailable,
  mapCompressionLevel,
  createCompressTransform,
  createDecompressTransform,
  compress,
  decompress,
  compressSync,
  compressSyncAtLevel,
  decompressSync,
  asZstdBuffer,
  compressChunks,
  decompressStream,
};

export default ZstdNode;
