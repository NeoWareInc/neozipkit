/**
 * In-memory and streaming ZIP writer.
 * Zstd level is the raw zlib level (ZipWiki default 7). NeoEncrypt stays off.
 * Caller extra blocks (ZipWiki 0x014F) are written beside optional 0x014E.
 */

import { closeSync, openSync, writeSync } from 'fs';
import { deflateRawSync } from 'zlib';
import ZipEntry from '../core/ZipEntry';
import { crc32, sha256 } from '../core/encryption/ZipCrypto';
import { compressSyncAtLevel } from './ZstdNode';
import {
  assertBufferAllowsEntryZip64,
  buildEndRecords,
} from '../core/zip64/Zip64';

export type ZipPrecompressedMember = {
  method: number;
  data: Buffer;
  crc32: number;
  uncompressedSize: number;
  /** Complete extra-field bytes copied onto the local and central headers. */
  extra?: Buffer;
};

export type ZipBufferMember = {
  name: string;
  /** Uncompressed payload. Unused as stored bytes when `precompressed` is set. */
  data: Buffer;
  mtime?: Date;
  /** DOS time word. Wins over `mtime` when set together with `dosDate`. */
  dosTime?: number;
  dosDate?: number;
  /**
   * Complete extra-field records (id, size, payload), e.g. ZipWiki 0x014F.
   * Ignored when `precompressed.extra` is set — that blob is copied as-is.
   */
  additionalExtra?: Buffer;
  /** Write Extra Field 0x014E (SHA-256 of uncompressed `data`). */
  useSHA256?: boolean;
  /** 0 store, 8 deflate, 93 zstd. Default 93. Ignored when `precompressed` is set. */
  method?: 0 | 8 | 93;
  /** zlib zstd level or raw deflate level. Default 7. */
  level?: number;
  precompressed?: ZipPrecompressedMember;
};

type FramedMember = {
  local: Buffer;
  payload: Buffer;
  central: Buffer;
};

function dosFromDate(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const y = Math.max(0, Math.min(127, year - 1980));
  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: ((y & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

function compressPayload(
  data: Buffer,
  method: 0 | 8 | 93,
  level: number,
): { method: number; data: Buffer } {
  if (method === 0 || data.length === 0) {
    return { method: 0, data };
  }
  const compressed =
    method === 8
      ? deflateRawSync(data, { level: Math.max(1, Math.min(9, level)) })
      : compressSyncAtLevel(data, Math.max(1, level));
  if (compressed.length >= data.length) {
    return { method: 0, data };
  }
  return { method, data: compressed };
}

function frameMembers(members: ZipBufferMember[]): FramedMember[] {
  const packTime = new Date();
  const framed: FramedMember[] = [];
  let offset = 0;
  for (const member of members) {
    const copied = member.precompressed;
    const uncompressed = member.data ?? Buffer.alloc(0);
    const level = member.level ?? 7;
    const requested = member.method ?? 93;
    const payload = copied
      ? {
          method: copied.method,
          data: copied.data,
          uncompressedSize: copied.uncompressedSize,
        }
      : {
          ...compressPayload(uncompressed, requested, level),
          uncompressedSize: uncompressed.length,
        };
    const crc = copied ? copied.crc32 >>> 0 : crc32(uncompressed) >>> 0;
    const extra = copied?.extra ?? member.additionalExtra;
    const dos =
      member.dosTime !== undefined && member.dosDate !== undefined
        ? { time: member.dosTime, date: member.dosDate }
        : dosFromDate(member.mtime ?? packTime);

    const entry = new ZipEntry(member.name, null, false);
    entry.bitFlags = 0;
    entry.emitUnicodePath = false;
    entry.isUpdated = true;
    entry.filename = member.name;
    entry.cmpMethod = payload.method;
    entry.crc = crc;
    entry.compressedSize = payload.data.length;
    entry.uncompressedSize = payload.uncompressedSize;
    entry.timeDateDOS = ((dos.date & 0xffff) << 16) | (dos.time & 0xffff);
    entry.localHdrOffset = offset;
    assertBufferAllowsEntryZip64(
      entry.uncompressedSize,
      entry.compressedSize,
      entry.localHdrOffset
    );
    if (!copied && member.useSHA256 === true) {
      entry.sha256 = sha256(uncompressed);
    }
    if (extra && extra.length > 0) {
      entry.additionalExtra = extra;
    }
    const local = entry.createLocalHdr();
    const central = entry.centralDirEntry();
    framed.push({ local, payload: payload.data, central });
    offset += local.length + payload.data.length;
  }
  return framed;
}

function eocd(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  return buildEndRecords({
    totalEntries: entryCount,
    centralDirSize: centralSize,
    centralDirOffset: centralOffset,
    zip64EocdOffset: centralOffset + centralSize,
    allowSizeOffsetZip64: false,
  });
}

/** Build a ZIP in one buffer. Kept for tests and atomic in-memory rewrites. */
export function buildZipBufferSync(members: ZipBufferMember[]): Buffer {
  const framed = frameMembers(members);
  const parts: Buffer[] = [];
  let centralSize = 0;
  let payloadBytes = 0;
  for (const part of framed) {
    parts.push(part.local, part.payload);
    payloadBytes += part.local.length + part.payload.length;
  }
  for (const part of framed) {
    parts.push(part.central);
    centralSize += part.central.length;
  }
  parts.push(eocd(framed.length, centralSize, payloadBytes));
  return Buffer.concat(parts);
}

/** Stream local headers, payloads, the central directory, and the EOCD to `filePath`. */
export function writeZipFileSync(filePath: string, members: ZipBufferMember[]): void {
  const framed = frameMembers(members);
  const fd = openSync(filePath, 'w');
  try {
    let payloadBytes = 0;
    let centralSize = 0;
    for (const part of framed) {
      writeSync(fd, part.local);
      writeSync(fd, part.payload);
      payloadBytes += part.local.length + part.payload.length;
    }
    for (const part of framed) {
      writeSync(fd, part.central);
      centralSize += part.central.length;
    }
    writeSync(fd, eocd(framed.length, centralSize, payloadBytes));
  } finally {
    closeSync(fd);
  }
}
