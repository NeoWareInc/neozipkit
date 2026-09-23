// ======================================
//	Zip64.ts — APPNOTE Zip64 Version 1 helpers
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// Large sizes/offsets/counts (PKWARE APPNOTE §§4.3.14–4.3.16, 4.5.3).
// Spanned disks and Zip64 EOCD extensible sector are out of scope.

import {
  CENTRAL_END,
  HDR_ID,
  ZIP64_CENTRAL_DIR,
  ZIP64_CENTRAL_END,
} from '../constants/Headers';

/** Classic u32 overflow sentinel */
export const ZIP64_U32 = 0xffffffff;
/** Classic u16 overflow sentinel */
export const ZIP64_U16 = 0xffff;
/** Version needed to extract when Zip64 extensions are used (4.5) */
export const ZIP64_VERSION_NEEDED = 45;
/**
 * Value stored in Zip64 EOCD "size of Zip64 EOCD record" for Version 1 with
 * an empty extensible data sector: fixed body (56) − leading 12 = 44.
 */
export const ZIP64_EOCD_SIZE_FIELD = 44;
/** Fixed Zip64 EOCD record length with empty extensible sector */
export const ZIP64_EOCD_RECORD_SIZE = 56;
/** Zip64 EOCD locator length */
export const ZIP64_LOCATOR_SIZE = 20;
/** Classic EOCD fixed length (without comment) */
export const CLASSIC_EOCD_SIZE = 22;

/**
 * Buffer/browser APIs must not materialize multi-GiB Zip64 archives in memory.
 * Use Node file/streaming APIs for size/offset Zip64.
 */
export const ZIP64_BUFFER_SIZE_OFFSET_ERROR =
  'Zip64 for sizes or offsets ≥ 4 GiB requires the Node file/streaming API; ' +
  'in-memory buffer/browser writers only support Zip64 for entry counts > 65535. ' +
  'Use ZipkitNode (createZipFromFiles / writeZipEntry) instead of buildZipBuffer.';

export interface Zip64ExtraFields {
  uncompressedSize?: number;
  compressedSize?: number;
  localHdrOffset?: number;
  diskStart?: number;
}

export interface ClassicSizeFields {
  uncompressedSize: number;
  compressedSize: number;
  localHdrOffset: number;
  diskStart: number;
}

export interface Zip64EocdFields {
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
  versionMadeBy?: number;
  versionNeeded?: number;
  diskNumber?: number;
  diskWithCdStart?: number;
}

export interface BuildEndRecordsOptions {
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
  /** Absolute file offset where the Zip64 EOCD will be written (CD end). */
  zip64EocdOffset: number;
  archiveComment?: string;
  /**
   * When false (buffer/browser), refuse Zip64 triggered by size/offset overflow.
   * Entry-count Zip64 is still allowed. Default true (Node streaming).
   */
  allowSizeOffsetZip64?: boolean;
  versionMadeBy?: number;
}

export function exceedsU32(value: number): boolean {
  return value > ZIP64_U32;
}

export function exceedsU16(value: number): boolean {
  return value > ZIP64_U16;
}

export function assertSafeInteger(value: number | bigint, label: string): number {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) {
    throw new Error(
      `Zip64 ${label} is not a safe non-negative integer (got ${String(value)}); ` +
        `values must fit in Number.MAX_SAFE_INTEGER`
    );
  }
  return n;
}

export function readU64AsNumber(buf: Buffer, offset: number): number {
  return assertSafeInteger(buf.readBigUInt64LE(offset), `u64@${offset}`);
}

export function writeU64(buf: Buffer, offset: number, value: number): void {
  assertSafeInteger(value, `u64 write@${offset}`);
  buf.writeBigUInt64LE(BigInt(value), offset);
}

export function needsZip64Entry(
  uncompressedSize: number,
  compressedSize: number,
  localHdrOffset: number,
  diskStart: number = 0
): boolean {
  return (
    exceedsU32(uncompressedSize) ||
    exceedsU32(compressedSize) ||
    exceedsU32(localHdrOffset) ||
    exceedsU16(diskStart)
  );
}

/** True when Zip64 is required for member size or local/CD offset (not entry count alone). */
export function needsZip64SizeOrOffset(
  uncompressedSize: number,
  compressedSize: number,
  localHdrOffset: number,
  centralDirSize: number = 0,
  centralDirOffset: number = 0
): boolean {
  return (
    exceedsU32(uncompressedSize) ||
    exceedsU32(compressedSize) ||
    exceedsU32(localHdrOffset) ||
    exceedsU32(centralDirSize) ||
    exceedsU32(centralDirOffset)
  );
}

export function needsZip64Archive(
  totalEntries: number,
  centralDirSize: number,
  centralDirOffset: number
): boolean {
  return (
    exceedsU16(totalEntries) ||
    exceedsU32(centralDirSize) ||
    exceedsU32(centralDirOffset)
  );
}

/**
 * Classic EOCD fields that indicate a Zip64 EOCD/locator must be consulted.
 */
export function classicEocdNeedsZip64(eocd: {
  volEntries: number;
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
}): boolean {
  return (
    eocd.centralDirOffset === ZIP64_U32 ||
    eocd.centralDirSize === ZIP64_U32 ||
    eocd.volEntries === ZIP64_U16 ||
    eocd.totalEntries === ZIP64_U16
  );
}

/**
 * Build Zip64 Extended Information Extra Field (0x0001).
 * Field order is fixed; only include fields whose classic header uses a sentinel.
 * For local headers, APPNOTE requires both sizes when the Zip64 block is present —
 * pass `forLocal: true` to always emit both size fields.
 */
export function buildZip64Extra(
  fields: Zip64ExtraFields,
  opts?: { forLocal?: boolean }
): Buffer {
  const forLocal = opts?.forLocal === true;
  const parts: number[] = [];

  const includeUncompressed =
    forLocal || fields.uncompressedSize !== undefined;
  const includeCompressed = forLocal || fields.compressedSize !== undefined;

  if (includeUncompressed) {
    if (fields.uncompressedSize === undefined) {
      throw new Error('Zip64 local extra requires uncompressedSize');
    }
    parts.push(8);
  }
  if (includeCompressed) {
    if (fields.compressedSize === undefined) {
      throw new Error('Zip64 local extra requires compressedSize');
    }
    parts.push(8);
  }
  if (fields.localHdrOffset !== undefined) parts.push(8);
  if (fields.diskStart !== undefined) parts.push(4);

  const dataSize = parts.reduce((a, b) => a + b, 0);
  const buf = Buffer.alloc(4 + dataSize);
  buf.writeUInt16LE(HDR_ID.ZIP64, 0);
  buf.writeUInt16LE(dataSize, 2);
  let o = 4;
  if (includeUncompressed) {
    writeU64(buf, o, fields.uncompressedSize!);
    o += 8;
  }
  if (includeCompressed) {
    writeU64(buf, o, fields.compressedSize!);
    o += 8;
  }
  if (fields.localHdrOffset !== undefined) {
    writeU64(buf, o, fields.localHdrOffset);
    o += 8;
  }
  if (fields.diskStart !== undefined) {
    buf.writeUInt32LE(fields.diskStart >>> 0, o);
  }
  return buf;
}

/**
 * Parse Zip64 extra payload (data after HeaderID + size).
 * Only fields whose classic values are sentinels are consumed, in APPNOTE order.
 */
export function parseZip64Extra(
  data: Buffer,
  classic: ClassicSizeFields
): Zip64ExtraFields {
  const out: Zip64ExtraFields = {};
  let o = 0;
  if (classic.uncompressedSize === ZIP64_U32) {
    if (o + 8 > data.length) {
      throw new Error('Zip64 extra truncated (uncompressed size)');
    }
    out.uncompressedSize = readU64AsNumber(data, o);
    o += 8;
  }
  if (classic.compressedSize === ZIP64_U32) {
    if (o + 8 > data.length) {
      throw new Error('Zip64 extra truncated (compressed size)');
    }
    out.compressedSize = readU64AsNumber(data, o);
    o += 8;
  }
  if (classic.localHdrOffset === ZIP64_U32) {
    if (o + 8 > data.length) {
      throw new Error('Zip64 extra truncated (local header offset)');
    }
    out.localHdrOffset = readU64AsNumber(data, o);
    o += 8;
  }
  if (classic.diskStart === ZIP64_U16) {
    if (o + 4 > data.length) {
      throw new Error('Zip64 extra truncated (disk start)');
    }
    out.diskStart = data.readUInt32LE(o);
  }
  return out;
}

/** True if a complete extra-field blob contains a Zip64 (0x0001) record. */
export function extraFieldHasZip64(extra: Buffer | null | undefined): boolean {
  if (!extra || extra.length < 4) return false;
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (id === HDR_ID.ZIP64) return true;
    i += 4 + len;
  }
  return false;
}

/** Strip Zip64 records from a concatenated extra-field blob (avoid double-emit on rewrite). */
export function stripZip64FromExtra(extra: Buffer | null | undefined): Buffer | null {
  if (!extra || extra.length < 4) return extra ?? null;
  const parts: Buffer[] = [];
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    const recEnd = i + 4 + len;
    if (recEnd > extra.length) break;
    if (id !== HDR_ID.ZIP64) {
      parts.push(Buffer.from(extra.subarray(i, recEnd)));
    }
    i = recEnd;
  }
  if (parts.length === 0) return null;
  return Buffer.concat(parts);
}

/**
 * Data descriptor length including optional signature.
 * Zip64: signature(4) + crc(4) + cmp(8) + uncmp(8) = 24
 * Classic: signature(4) + crc(4) + cmp(4) + uncmp(4) = 16
 */
export function dataDescriptorByteLength(useZip64Sizes: boolean): number {
  return useZip64Sizes ? 24 : 16;
}

export function buildZip64Eocd(fields: Zip64EocdFields): Buffer {
  const buf = Buffer.alloc(ZIP64_EOCD_RECORD_SIZE);
  buf.writeUInt32LE(ZIP64_CENTRAL_DIR.SIGNATURE, 0);
  writeU64(buf, ZIP64_CENTRAL_DIR.SIZE_FIELD, ZIP64_EOCD_SIZE_FIELD);
  buf.writeUInt16LE(fields.versionMadeBy ?? 45, ZIP64_CENTRAL_DIR.VER_MADEBY);
  buf.writeUInt16LE(
    fields.versionNeeded ?? ZIP64_VERSION_NEEDED,
    ZIP64_CENTRAL_DIR.VER_NEEDED
  );
  buf.writeUInt32LE(fields.diskNumber ?? 0, ZIP64_CENTRAL_DIR.VOL_NUM);
  buf.writeUInt32LE(fields.diskWithCdStart ?? 0, ZIP64_CENTRAL_DIR.VOLDIR_START);
  writeU64(buf, ZIP64_CENTRAL_DIR.VOL_ENTRIES, fields.totalEntries);
  writeU64(buf, ZIP64_CENTRAL_DIR.TOTAL_ENTRIES, fields.totalEntries);
  writeU64(buf, ZIP64_CENTRAL_DIR.CENTRAL_DIR_SIZE, fields.centralDirSize);
  writeU64(buf, ZIP64_CENTRAL_DIR.CENTRAL_DIR_OFFSET, fields.centralDirOffset);
  return buf;
}

export function buildZip64Locator(zip64EocdOffset: number): Buffer {
  const buf = Buffer.alloc(ZIP64_LOCATOR_SIZE);
  buf.writeUInt32LE(ZIP64_CENTRAL_END.SIGNATURE, 0);
  buf.writeUInt32LE(0, ZIP64_CENTRAL_END.VOL_NUM);
  writeU64(buf, ZIP64_CENTRAL_END.CENTRAL_DIR_OFFSET, zip64EocdOffset);
  buf.writeUInt32LE(1, ZIP64_CENTRAL_END.TOTAL_DISKS);
  return buf;
}

export function buildClassicEocd(opts: {
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
  archiveComment?: string;
  /** When true, write 0xFFFF / 0xFFFFFFFF for any field that overflows classic width. */
  useZip64Sentinels: boolean;
}): Buffer {
  const comment = opts.archiveComment || '';
  const commentBytes = Buffer.from(comment, 'utf8');
  const commentLength = Math.min(commentBytes.length, ZIP64_U16);
  const buf = Buffer.alloc(CLASSIC_EOCD_SIZE + commentLength);
  buf.writeUInt32LE(CENTRAL_END.SIGNATURE, 0);
  buf.writeUInt16LE(0, CENTRAL_END.VOL_NUM);
  buf.writeUInt16LE(0, CENTRAL_END.VOLDIR_START);

  const entries =
    opts.useZip64Sentinels && exceedsU16(opts.totalEntries)
      ? ZIP64_U16
      : opts.totalEntries;
  const cdSize =
    opts.useZip64Sentinels && exceedsU32(opts.centralDirSize)
      ? ZIP64_U32
      : opts.centralDirSize;
  const cdOffset =
    opts.useZip64Sentinels && exceedsU32(opts.centralDirOffset)
      ? ZIP64_U32
      : opts.centralDirOffset;

  buf.writeUInt16LE(entries, CENTRAL_END.VOL_ENTRIES);
  buf.writeUInt16LE(entries, CENTRAL_END.TOTAL_ENTRIES);
  buf.writeUInt32LE(cdSize, CENTRAL_END.CENTRAL_DIR_SIZE);
  buf.writeUInt32LE(cdOffset, CENTRAL_END.CENTRAL_DIR_OFFSET);
  buf.writeUInt16LE(commentLength, CENTRAL_END.ZIP_COMMENT_LEN);
  if (commentLength > 0) {
    commentBytes.copy(buf, CLASSIC_EOCD_SIZE, 0, commentLength);
  }
  return buf;
}

/**
 * Build Zip64 EOCD + Locator + classic EOCD (or classic EOCD alone).
 * Callers write the returned buffer at `zip64EocdOffset` (or CD end when no Zip64).
 */
export function buildEndRecords(opts: BuildEndRecordsOptions): Buffer {
  const allowSizeOffset = opts.allowSizeOffsetZip64 !== false;
  const needArchive = needsZip64Archive(
    opts.totalEntries,
    opts.centralDirSize,
    opts.centralDirOffset
  );

  if (!needArchive) {
    return buildClassicEocd({
      totalEntries: opts.totalEntries,
      centralDirSize: opts.centralDirSize,
      centralDirOffset: opts.centralDirOffset,
      archiveComment: opts.archiveComment,
      useZip64Sentinels: false,
    });
  }

  const sizeOffsetZip64 =
    exceedsU32(opts.centralDirSize) || exceedsU32(opts.centralDirOffset);
  if (sizeOffsetZip64 && !allowSizeOffset) {
    throw new Error(ZIP64_BUFFER_SIZE_OFFSET_ERROR);
  }

  const zip64Eocd = buildZip64Eocd({
    totalEntries: opts.totalEntries,
    centralDirSize: opts.centralDirSize,
    centralDirOffset: opts.centralDirOffset,
    versionMadeBy: opts.versionMadeBy ?? 45,
  });
  const locator = buildZip64Locator(opts.zip64EocdOffset);
  const classic = buildClassicEocd({
    totalEntries: opts.totalEntries,
    centralDirSize: opts.centralDirSize,
    centralDirOffset: opts.centralDirOffset,
    archiveComment: opts.archiveComment,
    useZip64Sentinels: true,
  });
  return Buffer.concat([zip64Eocd, locator, classic]);
}

/** Parse Zip64 EOCD fixed fields into CD size/offset/entry count. */
export function parseZip64Eocd(buf: Buffer): {
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
} {
  if (buf.length < ZIP64_EOCD_RECORD_SIZE) {
    throw new Error('Zip64 EOCD truncated');
  }
  if (buf.readUInt32LE(0) !== ZIP64_CENTRAL_DIR.SIGNATURE) {
    throw new Error('Invalid Zip64 EOCD signature');
  }
  return {
    totalEntries: readU64AsNumber(buf, ZIP64_CENTRAL_DIR.TOTAL_ENTRIES),
    centralDirSize: readU64AsNumber(buf, ZIP64_CENTRAL_DIR.CENTRAL_DIR_SIZE),
    centralDirOffset: readU64AsNumber(buf, ZIP64_CENTRAL_DIR.CENTRAL_DIR_OFFSET),
  };
}

export function parseZip64Locator(buf: Buffer): number {
  if (buf.length < ZIP64_LOCATOR_SIZE) {
    throw new Error('Zip64 locator truncated');
  }
  if (buf.readUInt32LE(0) !== ZIP64_CENTRAL_END.SIGNATURE) {
    throw new Error('Invalid Zip64 EOCD locator signature');
  }
  return readU64AsNumber(buf, ZIP64_CENTRAL_END.CENTRAL_DIR_OFFSET);
}

/**
 * Assert buffer/browser writers may proceed for the given entry sizes/offsets.
 * Throws {@link ZIP64_BUFFER_SIZE_OFFSET_ERROR} when size/offset Zip64 would be required.
 */
export function assertBufferAllowsEntryZip64(
  uncompressedSize: number,
  compressedSize: number,
  localHdrOffset: number
): void {
  if (needsZip64SizeOrOffset(uncompressedSize, compressedSize, localHdrOffset)) {
    throw new Error(ZIP64_BUFFER_SIZE_OFFSET_ERROR);
  }
}
