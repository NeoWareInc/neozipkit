// ======================================
//  ZipReaderBrowser.ts — thin positioned-read ZIP reader for browsers
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// Browser counterpart of `ZipReaderNode`: parses the central directory (classic
// EOCD + Zip64) over an async `readAt(offset, length)` and reads members on
// demand. No Node `fs`, no Node `zlib` / `ZstdNode`. Deflate uses pako; zstd uses
// the browser shim (native DecompressionStream, then `fzstd`).

import { Buffer } from 'buffer';
import pako from 'pako';
import {
  CENTRAL_DIR,
  CENTRAL_END,
  HDR_ID,
  LOCAL_HDR,
  ZIP64_CENTRAL_END,
} from '../core/constants/Headers';
import {
  META_MANIFEST_JSON,
  asciiPathEqualsIgnoreCase,
  isReservedMetaPath,
} from '../core/constants/MetaPaths';
import { crc32 } from '../core/encryption/ZipCrypto';
import { getExtraField } from '../core/extra';
import { parseManifestJson } from '../core/manifest';
import type { NeoZipManifest } from '../core/manifest';
import {
  ZIP64_EOCD_RECORD_SIZE,
  ZIP64_LOCATOR_SIZE,
  ZIP64_U16,
  ZIP64_U32,
  parseZip64Eocd,
  parseZip64Extra,
  parseZip64Locator,
} from '../core/zip64/Zip64';
import { decompress as zstdDecompress } from './zstd-browser-shim';

export class ZipIntegrityError extends Error {
  code: 'crc' | 'sha256' | 'size' | 'structure';
  entry?: string;
  constructor(code: ZipIntegrityError['code'], message: string, entry?: string) {
    super(message);
    this.name = 'ZipIntegrityError';
    this.code = code;
    this.entry = entry;
  }
}

export type ZipReaderBrowserEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
  /** Raw central-directory extra field bytes (Buffer is a Uint8Array subclass). */
  centralExtra: Uint8Array;
  /** General-purpose bit flags (bit 0 = encrypted, bit 11 = UTF-8 name). */
  flags: number;
};

export type ZipReaderBrowserRaw = {
  method: number;
  compressed: Uint8Array;
  crc32: number;
  uncompressedSize: number;
  localExtra: Uint8Array;
  centralExtra: Uint8Array;
};

type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

const MAX_EOCD_SCAN = CENTRAL_END.SIZE + 0xffff;
const EMPTY = Buffer.alloc(0);

/** Wrap bytes as a Buffer view (no copy). */
function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new Error('crypto.subtle is unavailable; SHA-256 verification needs a secure context');
  }
  // Copy into a fresh ArrayBuffer so SharedArrayBuffer-backed views are accepted.
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Uint8Array(await subtle.digest('SHA-256', copy));
}

/** Store (0), deflate (8, pako) and zstd (93: native DecompressionStream, then fzstd). */
async function inflateBrowser(method: number, data: Uint8Array): Promise<Uint8Array> {
  if (method === 0) return data.slice(); // detach from the archive buffer
  if (method === 8) {
    const out = pako.inflateRaw(data);
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  if (method === 93) {
    const out = await zstdDecompress(data);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  throw new Error(`unsupported compression method ${method}`);
}

export class ZipReaderBrowser {
  private readonly readAt: ReadAt;
  private readonly total: number;
  private readonly list: ZipReaderBrowserEntry[];
  private readonly byName = new Map<string, ZipReaderBrowserEntry>();

  private constructor(readAt: ReadAt, size: number, list: ZipReaderBrowserEntry[]) {
    this.readAt = readAt;
    this.total = size;
    this.list = list;
    for (const e of list) {
      if (!this.byName.has(e.name)) this.byName.set(e.name, e);
    }
  }

  static async fromArrayBuffer(buf: ArrayBuffer): Promise<ZipReaderBrowser> {
    const bytes = new Uint8Array(buf);
    return ZipReaderBrowser.fromReadAt(async (offset, length) => {
      if (offset < 0 || offset + length > bytes.length) {
        throw new ZipIntegrityError('structure', `read past end of archive at offset ${offset}`);
      }
      return bytes.subarray(offset, offset + length);
    }, bytes.length);
  }

  /** Uses `Blob.slice` per read, so only the touched ranges are loaded. */
  static async fromBlob(blob: Blob): Promise<ZipReaderBrowser> {
    return ZipReaderBrowser.fromReadAt(async (offset, length) => {
      if (offset < 0 || offset + length > blob.size) {
        throw new ZipIntegrityError('structure', `read past end of archive at offset ${offset}`);
      }
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    }, blob.size);
  }

  static async fromReadAt(readAt: ReadAt, size: number): Promise<ZipReaderBrowser> {
    const read = async (offset: number, length: number): Promise<Buffer> => {
      if (length === 0) return EMPTY;
      const got = await readAt(offset, length);
      if (got.length < length) {
        throw new ZipIntegrityError('structure', `unexpected end of file at offset ${offset + got.length}`);
      }
      return asBuffer(got.length === length ? got : got.subarray(0, length));
    };
    const list = await parseCentralDirectory(read, size);
    return new ZipReaderBrowser(read, size, list);
  }

  /** Archive size in bytes. */
  get size(): number {
    return this.total;
  }

  entries(): ZipReaderBrowserEntry[] {
    return this.list.slice();
  }

  /**
   * Look up by exact name. With `caseInsensitiveMeta`, a reserved `META-INF/*`
   * name also matches any ASCII case variant; more than one variant throws.
   */
  getEntry(name: string, opts?: { caseInsensitiveMeta?: boolean }): ZipReaderBrowserEntry | null {
    const exact = this.byName.get(name);
    if (exact) return exact;
    if (opts?.caseInsensitiveMeta && isReservedMetaPath(name)) {
      const matches = this.list.filter((e) => asciiPathEqualsIgnoreCase(e.name, name));
      if (matches.length > 1) {
        throw new ZipIntegrityError(
          'structure',
          `malformed archive: multiple case variants of ${name}: ${matches.map((m) => m.name).join(', ')}`,
          name
        );
      }
      return matches[0] ?? null;
    }
    return null;
  }

  /** Inflate and verify an entry (size, CRC-32, and 0x014E SHA-256 when present). */
  async readEntry(
    entry: ZipReaderBrowserEntry | string,
    opts?: { skipHashCheck?: boolean }
  ): Promise<Uint8Array> {
    const e = this.resolve(entry);
    if (e.flags & 1) {
      throw new Error(`entry is encrypted (unsupported by ZipReaderBrowser): ${e.name}`);
    }
    const raw = await this.readRaw(e);
    let out: Uint8Array;
    try {
      out = await inflateBrowser(raw.method, raw.compressed);
    } catch (err) {
      throw new ZipIntegrityError(
        'structure',
        `failed to inflate ${e.name}: ${(err as Error).message}`,
        e.name
      );
    }
    if (out.length !== e.uncompressedSize) {
      throw new ZipIntegrityError(
        'size',
        `${e.name}: expected ${e.uncompressedSize} bytes, got ${out.length}`,
        e.name
      );
    }
    if (opts?.skipHashCheck !== true) {
      if ((crc32(asBuffer(out)) >>> 0) !== (e.crc32 >>> 0)) {
        throw new ZipIntegrityError('crc', `${e.name}: CRC-32 mismatch`, e.name);
      }
      const expected = declaredSha256(e, raw.localExtra);
      if (expected.length > 0) {
        const actual = await sha256Bytes(out);
        if (expected.some((d) => !bytesEqual(d, actual))) {
          throw new ZipIntegrityError('sha256', `${e.name}: SHA-256 (0x014E) mismatch`, e.name);
        }
      }
    }
    return out;
  }

  /** Raw stored bytes plus header metadata (no inflate, no verification). */
  async readRaw(entry: ZipReaderBrowserEntry | string): Promise<ZipReaderBrowserRaw> {
    const e = this.resolve(entry);
    const loc = await this.locateData(e);
    const compressed = await this.readAt(loc.dataStart, e.compressedSize);
    return {
      method: e.method,
      compressed,
      crc32: e.crc32 >>> 0,
      uncompressedSize: e.uncompressedSize,
      localExtra: loc.localExtra,
      centralExtra: e.centralExtra,
    };
  }

  /** Read and verify every entry; throws {@link ZipIntegrityError} on the first failure. */
  async verifyAll(
    onProgress?: (info: { name: string; index: number; total: number }) => void
  ): Promise<void> {
    const total = this.list.length;
    for (let index = 0; index < total; index++) {
      const e = this.list[index];
      onProgress?.({ name: e.name, index, total });
      // Directory entries have no payload to verify.
      if (e.name.endsWith('/') && e.uncompressedSize === 0) continue;
      await this.readEntry(e);
    }
  }

  /** Read and parse `META-INF/manifest.json` (case-insensitive reserved path). */
  async readManifest(): Promise<NeoZipManifest> {
    const entry = this.getEntry(META_MANIFEST_JSON, { caseInsensitiveMeta: true });
    if (!entry) throw new Error(`${META_MANIFEST_JSON} not found`);
    const bytes = await this.readEntry(entry);
    return parseManifestJson(new TextDecoder('utf-8').decode(bytes));
  }

  // ---- internals -------------------------------------------------------

  private resolve(entry: ZipReaderBrowserEntry | string): ZipReaderBrowserEntry {
    if (typeof entry !== 'string') return entry;
    const e = this.getEntry(entry);
    if (!e) throw new Error(`entry not found: ${entry}`);
    return e;
  }

  private async locateData(
    e: ZipReaderBrowserEntry
  ): Promise<{ dataStart: number; localExtra: Uint8Array }> {
    const hdr = asBuffer(await this.readAt(e.localHeaderOffset, LOCAL_HDR.SIZE));
    if (hdr.length < LOCAL_HDR.SIZE || hdr.readUInt32LE(0) !== LOCAL_HDR.SIGNATURE) {
      throw new ZipIntegrityError(
        'structure',
        `${e.name}: bad local header signature at ${e.localHeaderOffset}`,
        e.name
      );
    }
    const nameLen = hdr.readUInt16LE(LOCAL_HDR.FNAME_LEN);
    const extraLen = hdr.readUInt16LE(LOCAL_HDR.EXTRA_LEN);
    const dataStart = e.localHeaderOffset + LOCAL_HDR.SIZE + nameLen + extraLen;
    if (dataStart + e.compressedSize > this.total) {
      throw new ZipIntegrityError('structure', `${e.name}: payload extends past end of archive`, e.name);
    }
    const localExtra =
      extraLen > 0
        ? Buffer.from(await this.readAt(e.localHeaderOffset + LOCAL_HDR.SIZE + nameLen, extraLen))
        : EMPTY;
    return { dataStart, localExtra };
  }
}

function declaredSha256(e: ZipReaderBrowserEntry, localExtra: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const extra of [e.centralExtra, localExtra]) {
    const d = getExtraField(asBuffer(extra), HDR_ID.SHA256);
    if (d && d.length === 32) out.push(d);
  }
  return out;
}

async function parseCentralDirectory(
  read: (offset: number, length: number) => Promise<Buffer>,
  size: number
): Promise<ZipReaderBrowserEntry[]> {
  if (size < CENTRAL_END.SIZE) {
    throw new ZipIntegrityError('structure', 'not a ZIP archive (too small)');
  }
  // Common case: no archive comment → EOCD is in the last 22 bytes. Widen only if needed.
  let tailLen = 0;
  let tailStart = 0;
  let tail: Buffer = EMPTY;
  let eocd = -1;
  for (const window of [CENTRAL_END.SIZE + 256, MAX_EOCD_SCAN]) {
    const want = Math.min(size, window);
    if (want <= tailLen) break;
    tailLen = want;
    tailStart = size - tailLen;
    tail = await read(tailStart, tailLen);
    for (let i = tail.length - CENTRAL_END.SIZE; i >= 0; i--) {
      if (tail.readUInt32LE(i) !== CENTRAL_END.SIGNATURE) continue;
      const commentLen = tail.readUInt16LE(i + CENTRAL_END.ZIP_COMMENT_LEN);
      if (i + CENTRAL_END.SIZE + commentLen <= tail.length) {
        eocd = i;
        break;
      }
    }
    if (eocd >= 0) break;
  }
  if (eocd < 0) {
    throw new ZipIntegrityError('structure', 'end of central directory not found');
  }

  let total = tail.readUInt16LE(eocd + CENTRAL_END.TOTAL_ENTRIES);
  let cdSize = tail.readUInt32LE(eocd + CENTRAL_END.CENTRAL_DIR_SIZE);
  let cdOffset = tail.readUInt32LE(eocd + CENTRAL_END.CENTRAL_DIR_OFFSET);

  if (total === ZIP64_U16 || cdSize === ZIP64_U32 || cdOffset === ZIP64_U32) {
    const eocdAbs = tailStart + eocd;
    if (eocdAbs >= ZIP64_LOCATOR_SIZE) {
      const loc = await read(eocdAbs - ZIP64_LOCATOR_SIZE, ZIP64_LOCATOR_SIZE);
      if (loc.readUInt32LE(0) === ZIP64_CENTRAL_END.SIGNATURE) {
        const z64Offset = parseZip64Locator(loc);
        const z64 = parseZip64Eocd(await read(z64Offset, ZIP64_EOCD_RECORD_SIZE));
        total = z64.totalEntries;
        cdSize = z64.centralDirSize;
        cdOffset = z64.centralDirOffset;
      }
    }
  }

  if (cdOffset + cdSize > size) {
    throw new ZipIntegrityError('structure', 'central directory extends past end of archive');
  }
  const cd = cdSize > 0 ? await read(cdOffset, cdSize) : EMPTY;

  const out: ZipReaderBrowserEntry[] = [];
  let pos = 0;
  for (let n = 0; n < total; n++) {
    if (pos + CENTRAL_DIR.SIZE > cd.length || cd.readUInt32LE(pos) !== CENTRAL_DIR.SIGNATURE) {
      throw new ZipIntegrityError('structure', `bad central directory header #${n}`);
    }
    const flags = cd.readUInt16LE(pos + CENTRAL_DIR.FLAGS);
    const method = cd.readUInt16LE(pos + CENTRAL_DIR.CMP_METHOD);
    const dosTime = cd.readUInt16LE(pos + CENTRAL_DIR.TIMEDATE_DOS);
    const dosDate = cd.readUInt16LE(pos + CENTRAL_DIR.TIMEDATE_DOS + 2);
    const crc = cd.readUInt32LE(pos + CENTRAL_DIR.CRC);
    let csize = cd.readUInt32LE(pos + CENTRAL_DIR.CMP_SIZE);
    let usize = cd.readUInt32LE(pos + CENTRAL_DIR.UNCMP_SIZE);
    const nameLen = cd.readUInt16LE(pos + CENTRAL_DIR.FNAME_LEN);
    const extraLen = cd.readUInt16LE(pos + CENTRAL_DIR.EXTRA_LEN);
    const commentLen = cd.readUInt16LE(pos + CENTRAL_DIR.COMMENT_LEN);
    const diskStart = cd.readUInt16LE(pos + CENTRAL_DIR.DISK_NUM);
    let lho = cd.readUInt32LE(pos + CENTRAL_DIR.LOCAL_HDR_OFFSET);

    const nameStart = pos + CENTRAL_DIR.SIZE;
    const extraStart = nameStart + nameLen;
    const commentStart = extraStart + extraLen;
    const next = commentStart + commentLen;
    if (next > cd.length) {
      throw new ZipIntegrityError('structure', `central directory header #${n} is truncated`);
    }
    const nameBytes = cd.subarray(nameStart, extraStart);
    const centralExtra = Buffer.from(cd.subarray(extraStart, commentStart));
    let name = nameBytes.toString('utf8');

    const up = getExtraField(centralExtra, HDR_ID.UNICODE_PATH);
    if (up && up.length >= 5 && up.readUInt32LE(1) === (crc32(nameBytes) >>> 0)) {
      name = up.subarray(5).toString('utf8');
    }

    const z64 = getExtraField(centralExtra, HDR_ID.ZIP64);
    if (z64) {
      const parsed = parseZip64Extra(z64, {
        uncompressedSize: usize,
        compressedSize: csize,
        localHdrOffset: lho,
        diskStart,
      });
      if (parsed.uncompressedSize !== undefined) usize = parsed.uncompressedSize;
      if (parsed.compressedSize !== undefined) csize = parsed.compressedSize;
      if (parsed.localHdrOffset !== undefined) lho = parsed.localHdrOffset;
    }

    out.push({
      name,
      method,
      compressedSize: csize,
      uncompressedSize: usize,
      crc32: crc >>> 0,
      dosTime,
      dosDate,
      localHeaderOffset: lho,
      centralExtra,
      flags,
    });
    pos = next;
  }
  return out;
}
