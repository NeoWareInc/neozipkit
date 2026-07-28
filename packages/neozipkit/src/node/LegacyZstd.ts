/**
 * Detect legacy NeoZipKit WASM zstd (`@oneidentity/zstd-js`).
 *
 * That codec wrote valid-looking zstd frames but declared Frame_Content_Size as
 * `uncompressed_size + 18`. Standard libzstd / Node zlib decode to the real
 * payload plus 18 trailing zero bytes. CRC of the truncated payload matches
 * the ZIP entry CRC.
 *
 * Header-only checks do not require decompressing. Verified checks decompress
 * with native zlib and confirm trailing zeros + optional CRC.
 */

import { ZstdNode } from './ZstdNode';
import { HashCalculator } from '../core/components/HashCalculator';

/** Fixed extra bytes declared/emitted by the broken WASM codec. */
export const LEGACY_WASM_ZSTD_PADDING = 18;

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

export type LegacyZstdConfidence = 'none' | 'header' | 'verified';

export interface LegacyZstdDetectResult {
  /** True when this looks like (or verifies as) legacy WASM zstd. */
  isLegacyWasm: boolean;
  /** How the decision was made. */
  confidence: LegacyZstdConfidence;
  /** Parsed Frame_Content_Size, if present in the frame header. */
  frameContentSize: number | null;
  /** Expected plaintext size from the ZIP entry (or caller). */
  expectedUncompressedSize: number;
  /** Declared/observed padding past expected size (typically 18). */
  paddingBytes: number;
  /** Human-readable reason. */
  reason: string;
}

export interface DetectLegacyZstdOptions {
  /**
   * When true (default), decompress with native zlib and confirm
   * trailing zeros (+ optional CRC) instead of trusting the header alone.
   */
  verify?: boolean;
  /** ZIP CRC-32 of the original uncompressed data (strengthens verified check). */
  crc?: number;
}

/**
 * Read Frame_Content_Size from a zstd frame header, or null if absent / unparseable.
 * @see https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md
 */
export function parseZstdFrameContentSize(compressed: Buffer): number | null {
  if (!compressed || compressed.length < 6) {
    return null;
  }
  if (
    compressed[0] !== ZSTD_MAGIC[0] ||
    compressed[1] !== ZSTD_MAGIC[1] ||
    compressed[2] !== ZSTD_MAGIC[2] ||
    compressed[3] !== ZSTD_MAGIC[3]
  ) {
    return null;
  }

  const descriptor = compressed[4];
  const fcsFlag = (descriptor >> 6) & 0x3;
  const singleSegment = ((descriptor >> 5) & 0x1) === 1;
  const dictIdFlag = descriptor & 0x3;
  const dictIdSizes = [0, 1, 2, 4];
  let pos = 5 + dictIdSizes[dictIdFlag];

  if (fcsFlag === 0) {
    if (!singleSegment) {
      return null;
    }
    if (pos >= compressed.length) {
      return null;
    }
    return compressed[pos];
  }

  const fcsSizes = [0, 2, 4, 8];
  const n = fcsSizes[fcsFlag];
  if (pos + n > compressed.length) {
    return null;
  }

  let fcs: number;
  if (n === 2) {
    fcs = compressed.readUInt16LE(pos);
  } else if (n === 4) {
    fcs = compressed.readUInt32LE(pos);
  } else {
    const lo = compressed.readUInt32LE(pos);
    const hi = compressed.readUInt32LE(pos + 4);
    // Content sizes that do not fit in JS safe integers are not our legacy case.
    if (hi !== 0) {
      return null;
    }
    fcs = lo;
  }

  // Spec: when FCS_Flag == 1, stored value is (size - 256).
  if (fcsFlag === 1) {
    fcs += 256;
  }
  return fcs;
}

/**
 * Fast header heuristic: FCS === expectedUncompressedSize + 18.
 */
export function looksLikeLegacyWasmZstd(
  compressed: Buffer,
  expectedUncompressedSize: number
): boolean {
  if (expectedUncompressedSize < 0 || !Number.isFinite(expectedUncompressedSize)) {
    return false;
  }
  const fcs = parseZstdFrameContentSize(compressed);
  if (fcs === null) {
    return false;
  }
  return fcs === expectedUncompressedSize + LEGACY_WASM_ZSTD_PADDING;
}

function crc32Of(data: Buffer): number {
  const h = new HashCalculator();
  h.update(data);
  return h.finalizeCRC32();
}

/**
 * Detect legacy WASM zstd frames for a single compressed payload.
 */
export async function detectLegacyWasmZstd(
  compressed: Buffer,
  expectedUncompressedSize: number,
  options?: DetectLegacyZstdOptions
): Promise<LegacyZstdDetectResult> {
  const expected = expectedUncompressedSize >>> 0;
  const fcs = parseZstdFrameContentSize(compressed);
  const headerMatch =
    fcs !== null && fcs === expected + LEGACY_WASM_ZSTD_PADDING;

  const base = {
    frameContentSize: fcs,
    expectedUncompressedSize: expected,
    paddingBytes: LEGACY_WASM_ZSTD_PADDING,
  };

  if (!headerMatch && options?.verify === false) {
    return {
      ...base,
      isLegacyWasm: false,
      confidence: 'none',
      reason:
        fcs === null
          ? 'No Frame_Content_Size in zstd header (or not a zstd frame)'
          : `Frame_Content_Size ${fcs} does not equal expected ${expected} + ${LEGACY_WASM_ZSTD_PADDING}`,
    };
  }

  if (options?.verify === false) {
    return {
      ...base,
      isLegacyWasm: true,
      confidence: 'header',
      reason: `Frame_Content_Size is expected+${LEGACY_WASM_ZSTD_PADDING} (legacy WASM heuristic)`,
    };
  }

  // Verified path (default): decompress and check padding / CRC.
  let decoded: Buffer;
  try {
    decoded = await ZstdNode.decompress(compressed);
  } catch (e) {
    return {
      ...base,
      isLegacyWasm: false,
      confidence: 'none',
      reason: `Native decompress failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const pad = decoded.length - expected;
  const trailingZeros =
    pad === LEGACY_WASM_ZSTD_PADDING &&
    decoded.subarray(expected).equals(Buffer.alloc(LEGACY_WASM_ZSTD_PADDING));
  const truncated = decoded.subarray(0, Math.min(expected, decoded.length));
  const crcOk =
    options?.crc === undefined ||
    options.crc === 0 ||
    crc32Of(truncated) === (options.crc >>> 0);

  if (trailingZeros && crcOk && decoded.length === expected + LEGACY_WASM_ZSTD_PADDING) {
    return {
      ...base,
      isLegacyWasm: true,
      confidence: 'verified',
      reason:
        options?.crc && options.crc !== 0
          ? `Decoded length is +${LEGACY_WASM_ZSTD_PADDING} with trailing zeros; truncated CRC matches`
          : `Decoded length is +${LEGACY_WASM_ZSTD_PADDING} with trailing zeros`,
    };
  }

  if (headerMatch && !trailingZeros) {
    return {
      ...base,
      isLegacyWasm: false,
      confidence: 'none',
      reason:
        'Header suggested legacy WASM but decoded payload did not have 18 trailing zeros',
    };
  }

  return {
    ...base,
    isLegacyWasm: false,
    confidence: 'none',
    paddingBytes: Math.max(0, pad),
    reason:
      decoded.length === expected
        ? 'Standard zstd frame (decoded size matches expected)'
        : `Decoded size ${decoded.length} does not match legacy pattern (expected ${expected} or ${expected + LEGACY_WASM_ZSTD_PADDING})`,
  };
}

/**
 * Truncate plaintext if it matches the legacy +18 zero padding pattern.
 * Returns the original buffer when not legacy-shaped.
 */
export function repairLegacyWasmZstdPlaintext(
  decoded: Buffer,
  expectedUncompressedSize: number,
  crc?: number
): { repaired: Buffer; wasLegacy: boolean } {
  const expected = expectedUncompressedSize >>> 0;
  if (
    decoded.length === expected + LEGACY_WASM_ZSTD_PADDING &&
    decoded.subarray(expected).equals(Buffer.alloc(LEGACY_WASM_ZSTD_PADDING))
  ) {
    const repaired = decoded.subarray(0, expected);
    if (crc !== undefined && crc !== 0) {
      if (crc32Of(repaired) !== (crc >>> 0)) {
        return { repaired: decoded, wasLegacy: false };
      }
    }
    return { repaired, wasLegacy: true };
  }
  if (decoded.length > expected && expected > 0) {
    // Match Rust extract behavior: bound to declared uncompressed size for zstd.
    const repaired = decoded.subarray(0, expected);
    if (crc !== undefined && crc !== 0 && crc32Of(repaired) === (crc >>> 0)) {
      return { repaired, wasLegacy: true };
    }
  }
  return { repaired: decoded, wasLegacy: false };
}

export const LegacyZstd = {
  LEGACY_WASM_ZSTD_PADDING,
  parseZstdFrameContentSize,
  looksLikeLegacyWasmZstd,
  detectLegacyWasmZstd,
  repairLegacyWasmZstdPlaintext,
};

export default LegacyZstd;
