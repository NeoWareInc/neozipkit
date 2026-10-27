/**
 * In-memory and streaming ZIP writer.
 * Zstd level is the raw zlib level (ZipWiki default 7). NeoEncrypt stays off.
 * Caller extra blocks (ZipWiki 0x014F) are written beside optional 0x014E.
 */

import { closeSync, openSync, readFileSync, writeSync } from 'fs';
import { deflateRawSync } from 'zlib';
import ZipEntry from '../core/ZipEntry';
import { crc32, sha256 } from '../core/encryption/ZipCrypto';
import { compressSyncAtLevel } from './ZstdNode';
import { inflateZipPayloadSync } from './inflateZipPayload';
import { HDR_ID, GP_FLAG } from '../core/constants/Headers';
import { isMetaInfPath } from '../core/constants/MetaPaths';
import { composeExtraFields, getExtraField } from '../core/extra';
import {
  computeArchiveMerkleRoot,
  type MerkleAlgorithm,
  type MerkleContentEntry,
} from '../core/merkle/MerkleRoot';
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
  /**
   * Uncompressed payload. Unused as stored bytes when `precompressed` is set.
   * Optional when `dataPath` is given (or the member is empty / precompressed).
   */
  data?: Buffer;
  /**
   * Read the uncompressed payload from this file instead of passing `data`.
   * **Limitation:** the file is read fully into memory with `fs.readFileSync`
   * before framing — not streamed yet. Ignored when `data` or `precompressed` is set.
   */
  dataPath?: string;
  mtime?: Date;
  /** DOS time word. Wins over `mtime` when set together with `dosDate`. */
  dosTime?: number;
  dosDate?: number;
  /**
   * Complete extra-field records (id, size, payload), e.g. ZipWiki 0x014F.
   * Ignored when `precompressed.extra` is set — that blob is copied as-is.
   */
  additionalExtra?: Buffer;
  /**
   * Extra-field records composed after the base extra with {@link composeExtraFields}.
   * Base = `precompressed.extra` when set, otherwise `additionalExtra`. Records here
   * are appended **after** the base and **win** on duplicate ids (the base copy of
   * that id is dropped). Unlike `additionalExtra`, these also apply on top of
   * `precompressed.extra`. When `useSHA256` writes 0x014E itself, a 0x014E entry
   * in `extras` is ignored.
   */
  extras?: Array<{ id: number; data: Buffer }>;
  /**
   * Write the filename as raw UTF-8 and set general-purpose bit 11 (EFS).
   * Default false: ASCII name with non-ASCII characters replaced by `?`
   * (use `emitUnicodePath` to carry the real name). Takes precedence over
   * `emitUnicodePath` (0x7075 is then redundant and skipped).
   */
  utf8Flag?: boolean;
  /**
   * Emit Info-ZIP Unicode Path Extra Field 0x7075 when the name has non-ASCII
   * (or quote) characters. Default false. Ignored when `utf8Flag` is true.
   */
  emitUnicodePath?: boolean;
  /** External file attributes (host-dependent; e.g. Unix mode << 16). Default 0. */
  externalAttr?: number;
  /** Internal file attributes. Default 0. */
  internalAttr?: number;
  /** Write Extra Field 0x014E (SHA-256 of uncompressed `data`). */
  useSHA256?: boolean;
  /** 0 store, 8 deflate, 93 zstd. Default 93. Ignored when `precompressed` is set. */
  method?: 0 | 8 | 93;
  /** zlib zstd level or raw deflate level. Default 7. */
  level?: number;
  /**
   * Force Zip64 Extra `0x0001` on this member even when sizes fit classic fields.
   * Pair with `forceZip64` on `buildZipBufferSync` / `writeZipFileSync` options
   * (or set on every member) so the EOCD is Zip64 as well.
   */
  forceZip64?: boolean;
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

function memberExtra(member: ZipBufferMember): Buffer | undefined {
  const base = member.precompressed?.extra ?? member.additionalExtra;
  let extras = member.extras;
  if (!extras || extras.length === 0) return base;
  if (member.useSHA256 === true && !member.precompressed) {
    extras = extras.filter((r) => r.id !== HDR_ID.SHA256);
  }
  return composeExtraFields(base, ...extras);
}

/** Load `dataPath` payloads once so framing and Merkle share the same bytes. */
function resolveMemberData(members: ZipBufferMember[]): ZipBufferMember[] {
  return members.map((m) => {
    if (m.data !== undefined || m.precompressed || m.dataPath === undefined) return m;
    return { ...m, data: readFileSync(m.dataPath), dataPath: undefined };
  });
}

function merkleOf(members: ZipBufferMember[], algorithm: MerkleAlgorithm): string | null {
  const entries: MerkleContentEntry[] = [];
  for (const m of members) {
    if (isMetaInfPath(m.name)) continue;
    if (m.precompressed) {
      const digest =
        algorithm === 'v0' ? getExtraField(m.precompressed.extra, HDR_ID.SHA256) : null;
      if (digest && digest.length === 32) {
        entries.push({ path: m.name, contentSha256: digest });
      } else {
        entries.push({
          path: m.name,
          content: inflateZipPayloadSync(m.precompressed.method, m.precompressed.data),
        });
      }
    } else {
      entries.push({ path: m.name, content: m.data ?? Buffer.alloc(0) });
    }
  }
  return computeArchiveMerkleRoot(entries, algorithm);
}

function frameMembers(
  members: ZipBufferMember[],
  opts?: { forceZip64?: boolean }
): FramedMember[] {
  const packTime = new Date();
  const framed: FramedMember[] = [];
  let offset = 0;
  const forceAll = opts?.forceZip64 === true;
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
    const extra = memberExtra(member);
    const dos =
      member.dosTime !== undefined && member.dosDate !== undefined
        ? { time: member.dosTime, date: member.dosDate }
        : dosFromDate(member.mtime ?? packTime);

    const entry = new ZipEntry(member.name, null, false);
    entry.bitFlags = member.utf8Flag === true ? GP_FLAG.EFS : 0;
    entry.utf8Filename = member.utf8Flag === true;
    entry.emitUnicodePath = member.emitUnicodePath === true;
    if (member.externalAttr !== undefined) entry.extFileAttr = member.externalAttr >>> 0;
    if (member.internalAttr !== undefined) entry.intFileAttr = member.internalAttr & 0xffff;
    entry.isUpdated = true;
    entry.filename = member.name;
    entry.cmpMethod = payload.method;
    entry.crc = crc;
    entry.compressedSize = payload.data.length;
    entry.uncompressedSize = payload.uncompressedSize;
    entry.timeDateDOS = ((dos.date & 0xffff) << 16) | (dos.time & 0xffff);
    entry.localHdrOffset = offset;
    entry.forceZip64 = forceAll || member.forceZip64 === true;
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

function eocd(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
  forceZip64?: boolean
): Buffer {
  return buildEndRecords({
    totalEntries: entryCount,
    centralDirSize: centralSize,
    centralDirOffset: centralOffset,
    zip64EocdOffset: centralOffset + centralSize,
    allowSizeOffsetZip64: false,
    forceZip64: forceZip64 === true,
  });
}

export type BuildZipBufferOptions = {
  /** Force Zip64 EOCD + per-member Extra when sizes fit classic fields. */
  forceZip64?: boolean;
  /**
   * Compute the APPNOTE §6 archive Merkle root over the members' uncompressed
   * bytes (`META-INF/**` excluded). On {@link buildZipBufferSync} / {@link buildZipBuffer}
   * this changes the return type to `{ buffer, merkleRoot }`. Precompressed members
   * are inflated (v1) or use their 0x014E digest when present (v0).
   * Ignored by {@link writeZipFileSync} / {@link writeZipFile}.
   */
  computeMerkle?: MerkleAlgorithm;
};

export type BuildZipBufferMerkleResult = {
  buffer: Buffer;
  /** Lowercase hex root, or null when there are no non-META members. */
  merkleRoot: string | null;
};

function buildBuffer(members: ZipBufferMember[], options?: BuildZipBufferOptions): Buffer {
  const forceZip64 = options?.forceZip64 === true;
  const framed = frameMembers(members, { forceZip64 });
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
  parts.push(eocd(framed.length, centralSize, payloadBytes, forceZip64));
  return Buffer.concat(parts);
}

/**
 * Build a ZIP in one buffer. Kept for tests and atomic in-memory rewrites.
 * Returns a `Buffer`, or `{ buffer, merkleRoot }` when `options.computeMerkle` is set.
 */
export function buildZipBufferSync(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions & { computeMerkle?: undefined }
): Buffer;
export function buildZipBufferSync(
  members: ZipBufferMember[],
  options: BuildZipBufferOptions & { computeMerkle: MerkleAlgorithm }
): BuildZipBufferMerkleResult;
export function buildZipBufferSync(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): Buffer | BuildZipBufferMerkleResult;
export function buildZipBufferSync(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): Buffer | BuildZipBufferMerkleResult {
  const resolved = resolveMemberData(members);
  const buffer = buildBuffer(resolved, options);
  if (options?.computeMerkle) {
    return { buffer, merkleRoot: merkleOf(resolved, options.computeMerkle) };
  }
  return buffer;
}

/** Async form of {@link buildZipBufferSync} (currently wraps the sync implementation). */
export function buildZipBuffer(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions & { computeMerkle?: undefined }
): Promise<Buffer>;
export function buildZipBuffer(
  members: ZipBufferMember[],
  options: BuildZipBufferOptions & { computeMerkle: MerkleAlgorithm }
): Promise<BuildZipBufferMerkleResult>;
export function buildZipBuffer(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): Promise<Buffer | BuildZipBufferMerkleResult>;
export async function buildZipBuffer(
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): Promise<Buffer | BuildZipBufferMerkleResult> {
  return buildZipBufferSync(members, options);
}

/** Stream local headers, payloads, the central directory, and the EOCD to `filePath`. */
export function writeZipFileSync(
  filePath: string,
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): void {
  const forceZip64 = options?.forceZip64 === true;
  const framed = frameMembers(resolveMemberData(members), { forceZip64 });
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
    writeSync(fd, eocd(framed.length, centralSize, payloadBytes, forceZip64));
  } finally {
    closeSync(fd);
  }
}

/**
 * Async form of {@link writeZipFileSync}. Members may use `dataPath`; files are
 * read whole (not streamed yet).
 */
export async function writeZipFile(
  filePath: string,
  members: ZipBufferMember[],
  options?: BuildZipBufferOptions
): Promise<void> {
  writeZipFileSync(filePath, members, options);
}
