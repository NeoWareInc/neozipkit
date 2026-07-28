/**
 * Browser stub for ZSTD — native zlib streaming is Node-only.
 * Browser builds alias `ZstdNode` to this module so the bad WASM codec is never shipped.
 */

const ZSTD_BROWSER_UNSUPPORTED =
  'ZSTD requires Node.js with native zlib support (Node.js >= 22.15 or >= 23.8). ' +
  'Browser builds do not include a zstd codec; use Deflate or process zstd archives in Node.';

function unsupported(): never {
  throw new Error(ZSTD_BROWSER_UNSUPPORTED);
}

export function isNativeZstdAvailable(): boolean {
  return false;
}

export function mapCompressionLevel(_level: number): number {
  return unsupported();
}

export function createCompressTransform(_level?: number): never {
  return unsupported();
}

export function createDecompressTransform(): never {
  return unsupported();
}

export async function compress(_data: Buffer, _level?: number): Promise<Buffer> {
  return unsupported();
}

export async function decompress(_data: Buffer): Promise<Buffer> {
  return unsupported();
}

export function compressSync(_data: Buffer, _level?: number): Buffer {
  return unsupported();
}

export function decompressSync(_data: Buffer): Buffer {
  return unsupported();
}

export async function compressChunks(
  _readChunk: (position: number, size: number) => Buffer,
  _totalSize: number,
  _chunkSize: number,
  _level: number,
  _onPlainChunk?: (chunk: Buffer) => void,
  _onCompressedChunk?: (chunk: Buffer) => void | Promise<void>
): Promise<number> {
  return unsupported();
}

export async function* decompressStream(
  _compressedStream: AsyncIterable<Buffer>
): AsyncGenerator<Buffer> {
  unsupported();
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
