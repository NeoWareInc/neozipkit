/**
 * Unit tests for native Node zstd (zlib) chunked helpers
 */

import { ZstdNode, isNativeZstdAvailable } from '../../../src/node/ZstdNode';
import ZipkitNode from '../../../src/node/ZipkitNode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CMP_METHOD } from '../../../src/core/constants/Headers';

describe('ZstdNode (native zlib)', () => {
  it('reports native zstd availability on this Node runtime', () => {
    expect(typeof isNativeZstdAvailable()).toBe('boolean');
  });

  it('round-trips buffer compress/decompress', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const input = Buffer.from('Native zstd buffer roundtrip. '.repeat(50));
    const compressed = await ZstdNode.compress(input, 6);
    expect(compressed.length).toBeGreaterThan(0);
    expect(compressed.equals(input)).toBe(false);
    const plain = await ZstdNode.decompress(compressed);
    expect(plain.equals(input)).toBe(true);
  });

  it('stream-compresses chunked input', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const input = Buffer.from('Chunked native zstd streaming. '.repeat(200));
    const chunkSize = 64;
    const collected: Buffer[] = [];
    const size = await ZstdNode.compressChunks(
      (pos, size) => input.subarray(pos, pos + size),
      input.length,
      chunkSize,
      3,
      undefined,
      async (chunk) => {
        collected.push(chunk);
      }
    );
    expect(size).toBeGreaterThan(0);
    const compressed = Buffer.concat(collected);
    expect(compressed.length).toBe(size);
    const plain = await ZstdNode.decompress(compressed);
    expect(plain.equals(input)).toBe(true);
  });

  it('stream-decompresses chunked compressed input', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const input = Buffer.from('Decompress stream test data. '.repeat(100));
    const compressed = await ZstdNode.compress(input, 5);
    async function* chunks(): AsyncGenerator<Buffer> {
      const step = 32;
      for (let i = 0; i < compressed.length; i += step) {
        yield compressed.subarray(i, Math.min(i + step, compressed.length));
      }
    }
    const out: Buffer[] = [];
    for await (const chunk of ZstdNode.decompressStream(chunks())) {
      out.push(chunk);
    }
    expect(Buffer.concat(out).equals(input)).toBe(true);
  });

  it('produces frames readable by system-compatible native decompress', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const input = Buffer.from('Standard zstd frame for Node native path. '.repeat(40));
    const compressed = await ZstdNode.compress(input, 4);
    expect(ZstdNode.decompressSync(compressed).equals(input)).toBe(true);
    expect(ZstdNode.compressSync(input, 4).length).toBeGreaterThan(0);
  });

  it('ZipkitNode create/extract round-trips zstd via native streaming', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neozip-zstd-'));
    const src = path.join(dir, 'big.txt');
    const zipPath = path.join(dir, 'out.zip');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(outDir);
    const payload = Buffer.from('ZipkitNode native zstd stream roundtrip. '.repeat(5000));
    fs.writeFileSync(src, payload);

    const zip = new ZipkitNode();
    await zip.createZipFromFiles([src], zipPath, { useZstd: true, level: 3, bufferSize: 4096 });
    const entries = await zip.loadZipFile(zipPath);
    expect(entries.length).toBe(1);
    expect(entries[0].cmpMethod).toBe(CMP_METHOD.ZSTD);

    await zip.extractZipFile(zipPath, outDir);
    const extracted = fs.readFileSync(path.join(outDir, 'big.txt'));
    expect(extracted.equals(payload)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
