/**
 * Unit tests for legacy WASM zstd detection
 */

import * as zlib from 'zlib';
import {
  LEGACY_WASM_ZSTD_PADDING,
  parseZstdFrameContentSize,
  looksLikeLegacyWasmZstd,
  detectLegacyWasmZstd,
  repairLegacyWasmZstdPlaintext,
} from '../../../src/node/LegacyZstd';
import { isNativeZstdAvailable } from '../../../src/node/ZstdNode';
import { HashCalculator } from '../../../src/core/components/HashCalculator';

/** Simulate the WASM symptom: compress (payload + 18 zero bytes). */
function fakeLegacyCompressed(payload: Buffer): Buffer {
  const padded = Buffer.concat([payload, Buffer.alloc(LEGACY_WASM_ZSTD_PADDING, 0)]);
  return zlib.zstdCompressSync(padded, {
    params: { [zlib.constants.ZSTD_c_compressionLevel]: 3 },
  });
}

describe('LegacyZstd detector', () => {
  it('parses Frame_Content_Size from a crafted header (FCS_Flag=1)', () => {
    // magic + fd(0x60) + uint16LE(4018-256=3762=0x0EB2)
    const hdr = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x60, 0xb2, 0x0e]);
    expect(parseZstdFrameContentSize(hdr)).toBe(4018);
  });

  it('detects header heuristic expected+18', () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const payload = Buffer.alloc(400, 0x41);
    const compressed = fakeLegacyCompressed(payload);
    expect(looksLikeLegacyWasmZstd(compressed, payload.length)).toBe(true);
    expect(looksLikeLegacyWasmZstd(compressed, payload.length + 1)).toBe(false);
  });

  it('verifies legacy pattern with trailing zeros and CRC', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const payload = Buffer.from('legacy wasm zstd payload data. '.repeat(20));
    const compressed = fakeLegacyCompressed(payload);
    const h = new HashCalculator();
    h.update(payload);
    const crc = h.finalizeCRC32();

    const result = await detectLegacyWasmZstd(compressed, payload.length, {
      verify: true,
      crc,
    });
    expect(result.isLegacyWasm).toBe(true);
    expect(result.confidence).toBe('verified');
    expect(result.paddingBytes).toBe(LEGACY_WASM_ZSTD_PADDING);
  });

  it('does not flag standard zstd frames', async () => {
    if (!isNativeZstdAvailable()) {
      return;
    }
    const payload = Buffer.from('standard zstd frame. '.repeat(30));
    const compressed = zlib.zstdCompressSync(payload);
    const result = await detectLegacyWasmZstd(compressed, payload.length, { verify: true });
    expect(result.isLegacyWasm).toBe(false);
    expect(result.confidence).toBe('none');
  });

  it('repairs legacy plaintext by truncating trailing zeros', () => {
    const payload = Buffer.alloc(100, 0x7a);
    const decoded = Buffer.concat([payload, Buffer.alloc(18, 0)]);
    const { repaired, wasLegacy } = repairLegacyWasmZstdPlaintext(decoded, payload.length);
    expect(wasLegacy).toBe(true);
    expect(repaired.equals(payload)).toBe(true);
  });
});
