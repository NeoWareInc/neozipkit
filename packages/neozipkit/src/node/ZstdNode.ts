/**
 * ZstdNode - Native Node.js Zstandard via zlib (streaming / chunked)
 *
 * This is the only zstd backend in NeoZipKit. There is no WASM codec.
 * Requires Node.js with `zlib.createZstdCompress` (Node >= 22.15 or >= 23.8).
 * Browser builds alias this module to a stub that throws.
 */

import * as zlib from 'zlib';
import { Readable } from 'stream';
import { promisify } from 'util';

const zstdCompressAsync = promisify(zlib.zstdCompress);
const zstdDecompressAsync = promisify(zlib.zstdDecompress);

export function isNativeZstdAvailable(): boolean {
  return (
    typeof zlib.createZstdCompress === 'function' &&
    typeof zlib.createZstdDecompress === 'function' &&
    typeof zlib.zstdCompress === 'function' &&
    typeof zlib.zstdDecompress === 'function'
  );
}

function assertNativeZstd(): void {
  if (!isNativeZstdAvailable()) {
    throw new Error(
      'Native zstd requires Node.js with zlib ZSTD support ' +
        '(Node.js >= 22.15 or >= 23.8).'
    );
  }
}

/** Map NeoZipKit level 1–9 to a zstd compression level (1–19). */
export function mapCompressionLevel(level: number): number {
  return Math.min(Math.max(1, Math.floor(level * 2.1)), 19);
}

function compressOptions(level: number): zlib.ZstdOptions {
  return {
    params: {
      [zlib.constants.ZSTD_c_compressionLevel]: mapCompressionLevel(level),
    },
  };
}

export function createCompressTransform(level: number = 6): zlib.ZstdCompress {
  assertNativeZstd();
  return zlib.createZstdCompress(compressOptions(level));
}

export function createDecompressTransform(): zlib.ZstdDecompress {
  assertNativeZstd();
  return zlib.createZstdDecompress();
}

export async function compress(data: Buffer, level: number = 6): Promise<Buffer> {
  assertNativeZstd();
  const result = await zstdCompressAsync(data, compressOptions(level));
  return Buffer.from(result);
}

export async function decompress(data: Buffer): Promise<Buffer> {
  assertNativeZstd();
  const result = await zstdDecompressAsync(data);
  return Buffer.from(result);
}

export function compressSync(data: Buffer, level: number = 6): Buffer {
  assertNativeZstd();
  return zlib.zstdCompressSync(data, compressOptions(level));
}

export function decompressSync(data: Buffer): Buffer {
  assertNativeZstd();
  return zlib.zstdDecompressSync(data);
}

/**
 * Stream-compress plaintext from a chunked reader (primary path for all sizes).
 */
export async function compressChunks(
  readChunk: (position: number, size: number) => Buffer,
  totalSize: number,
  chunkSize: number,
  level: number,
  onPlainChunk?: (chunk: Buffer) => void,
  onCompressedChunk?: (chunk: Buffer) => void | Promise<void>
): Promise<number> {
  async function* plainChunks(): AsyncGenerator<Buffer> {
    let position = 0;
    while (position < totalSize) {
      const size = Math.min(chunkSize, totalSize - position);
      const chunk = readChunk(position, size);
      onPlainChunk?.(chunk);
      position += chunk.length;
      yield chunk;
    }
  }

  const transform = createCompressTransform(level);
  const readable = Readable.from(plainChunks());
  readable.pipe(transform);

  let compressedSize = 0;
  try {
    for await (const out of transform) {
      const buf = Buffer.isBuffer(out) ? out : Buffer.from(out as Uint8Array);
      compressedSize += buf.length;
      if (onCompressedChunk) {
        await onCompressedChunk(buf);
      }
    }
  } finally {
    readable.destroy();
    transform.destroy();
  }

  return compressedSize;
}

/**
 * Decompress an async iterable of compressed chunks, yielding plaintext buffers.
 */
export async function* decompressStream(
  compressedStream: AsyncIterable<Buffer>
): AsyncGenerator<Buffer> {
  const transform = createDecompressTransform();
  const readable = Readable.from(compressedStream);
  readable.pipe(transform);

  try {
    for await (const chunk of transform) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    }
  } finally {
    readable.destroy();
    transform.destroy();
  }
}

export const ZstdNode = {
  isNativeZstdAvailable,
  mapCompressionLevel,
  createCompressTransform,
  createDecompressTransform,
  compress,
  decompress,
  compressSync,
  decompressSync,
  compressChunks,
  decompressStream,
};

export default ZstdNode;
