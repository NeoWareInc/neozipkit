// ======================================
//	OriginExtra.ts — NeoZip Extra Field 0x014F (original locator)
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// APPNOTE §7.1.1 / ZipWiki §6.7 — v1 TLV (URI, CRC-32, size, mtime, SHA-256).
// The kit stores opaque caller extras on ZipEntry.additionalExtra; these helpers
// build and parse the 0x014F wire form.

import { HDR_ID } from '../constants/Headers';
import { crc32, sha256 } from '../encryption/ZipCrypto';

/** Payload version byte. Stays 0x01 until first release. */
export const ORIGIN_EXTRA_VERSION = 0x01;

/** Soft cap on URI byte length (well under uint16 extra size). */
export const ORIGIN_URI_MAX_BYTES = 2048;

/** Registered v1 TLV tags. Unknown tags are skipped (forward compatible). */
export const ORIGIN_TAG = {
  URI: 0x01,
  CRC32: 0x02,
  SIZE: 0x03,
  MTIME: 0x04,
  SHA256: 0x05,
} as const;

export type OriginLocator = {
  /** Absolute RFC 3986 URI (`https:` / `http:` / `file:`). */
  uri?: string;
  /** ZIP/IEEE CRC-32 of original uncompressed bytes. */
  crc32?: number;
  /** Original uncompressed byte length. */
  size?: number;
  /** Original modification time: Unix seconds (UTC, signed). */
  mtime?: number;
  /** SHA-256 of original uncompressed bytes (32 bytes or hex). */
  sha256?: Buffer | string;
};

function originSha256Bytes(value: Buffer | string): Buffer {
  const buf = typeof value === 'string' ? Buffer.from(value, 'hex') : value;
  if (buf.length !== 32) {
    throw new Error('0x014F sha256 must be 32 bytes');
  }
  return buf;
}

function tlv(tag: number, value: Buffer): Buffer {
  const rec = Buffer.alloc(3 + value.length);
  rec.writeUInt8(tag, 0);
  rec.writeUInt16LE(value.length, 1);
  value.copy(rec, 3);
  return rec;
}

function assertInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`0x014F ${name} must be an integer`);
  }
}

export function originLocatorPresent(
  loc: OriginLocator | null | undefined
): loc is OriginLocator {
  if (!loc) return false;
  return (
    (typeof loc.uri === 'string' && loc.uri.length > 0) ||
    loc.crc32 !== undefined ||
    loc.size !== undefined ||
    loc.mtime !== undefined ||
    loc.sha256 !== undefined
  );
}

/** ZIP/IEEE CRC-32 of uncompressed original bytes. */
export function originCrc32Of(buf: Buffer): number {
  return crc32(buf) >>> 0;
}

/** SHA-256 of uncompressed original bytes (32-byte Buffer). */
export function originSha256Of(buf: Buffer): Buffer {
  return Buffer.from(sha256(buf), 'hex');
}

/** Truncate a Date to Unix seconds (UTC). */
export function unixTimeSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Build Extra Field 0x014F (v1 TLV). Throws if no attribute is present,
 * if URI is empty when provided, or if URI exceeds max bytes.
 */
export function makeOriginExtra(loc: OriginLocator): Buffer {
  const records: Buffer[] = [];

  const uri = loc.uri?.trim();
  if (uri !== undefined && uri.length === 0) {
    throw new Error('0x014F URI must be non-empty when present');
  }
  if (uri) {
    const uriBuf = Buffer.from(uri, 'utf8');
    if (uriBuf.length > ORIGIN_URI_MAX_BYTES) {
      throw new Error(
        `0x014F URI exceeds ${ORIGIN_URI_MAX_BYTES} bytes (${uriBuf.length})`
      );
    }
    records.push(tlv(ORIGIN_TAG.URI, uriBuf));
  }

  if (loc.crc32 !== undefined) {
    assertInteger('crc32', loc.crc32);
    const b = Buffer.alloc(4);
    b.writeUInt32LE(loc.crc32 >>> 0, 0);
    records.push(tlv(ORIGIN_TAG.CRC32, b));
  }

  if (loc.size !== undefined) {
    assertInteger('size', loc.size);
    if (loc.size < 0) {
      throw new Error('0x014F size must be >= 0');
    }
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(loc.size), 0);
    records.push(tlv(ORIGIN_TAG.SIZE, b));
  }

  if (loc.mtime !== undefined) {
    assertInteger('mtime', loc.mtime);
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(BigInt(loc.mtime), 0);
    records.push(tlv(ORIGIN_TAG.MTIME, b));
  }

  if (loc.sha256 !== undefined) {
    records.push(tlv(ORIGIN_TAG.SHA256, originSha256Bytes(loc.sha256)));
  }

  if (records.length === 0) {
    throw new Error('0x014F requires at least one attribute');
  }

  const dataSize = 1 + records.reduce((n, r) => n + r.length, 0);
  const extra = Buffer.alloc(4 + dataSize);
  extra.writeUInt16LE(HDR_ID.ORIGIN, 0);
  extra.writeUInt16LE(dataSize, 2);
  extra.writeUInt8(ORIGIN_EXTRA_VERSION, 4);
  let off = 5;
  for (const rec of records) {
    rec.copy(extra, off);
    off += rec.length;
  }
  return extra;
}

function parseOriginTlv(data: Buffer): OriginLocator | null {
  const loc: OriginLocator = {};
  let i = 0;
  while (i + 3 <= data.length) {
    const tag = data.readUInt8(i);
    const len = data.readUInt16LE(i + 1);
    i += 3;
    if (i + len > data.length) break;
    const value = data.subarray(i, i + len);
    i += len;
    if (tag === ORIGIN_TAG.URI && len > 0) {
      const u = value.toString('utf8');
      if (u.length > 0) loc.uri = u;
    } else if (tag === ORIGIN_TAG.CRC32 && len === 4) {
      loc.crc32 = value.readUInt32LE(0) >>> 0;
    } else if (tag === ORIGIN_TAG.SIZE && len === 8) {
      loc.size = Number(value.readBigUInt64LE(0));
    } else if (tag === ORIGIN_TAG.MTIME && len === 8) {
      loc.mtime = Number(value.readBigInt64LE(0));
    } else if (tag === ORIGIN_TAG.SHA256 && len === 32) {
      loc.sha256 = Buffer.from(value);
    }
  }
  return originLocatorPresent(loc) ? loc : null;
}

/** Walk a ZIP Extra Field blob for NeoZip 0x014F (v1 TLV). */
export function parseOriginFromExtra(extra: Buffer | null | undefined): OriginLocator | null {
  if (!extra || extra.length < 4) return null;
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = extra.readUInt16LE(i);
    const size = extra.readUInt16LE(i + 2);
    i += 4;
    if (i + size > extra.length) break;
    if (id === HDR_ID.ORIGIN && size >= 1) {
      const version = extra.readUInt8(i);
      const payload = extra.subarray(i + 1, i + size);
      if (version === ORIGIN_EXTRA_VERSION) {
        const loc = parseOriginTlv(payload);
        if (loc) return loc;
      }
    }
    i += size;
  }
  return null;
}

/** Read origin locator from a ZipEntry's preserved caller extras. */
export function parseOriginFromEntry(entry: {
  additionalExtra?: Buffer | null;
}): OriginLocator | null {
  return parseOriginFromExtra(entry.additionalExtra ?? null);
}
