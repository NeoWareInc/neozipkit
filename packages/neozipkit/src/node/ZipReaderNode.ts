// ======================================
//  ZipReaderNode.ts — thin pread-style ZIP reader
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// Parses the central directory itself (classic EOCD + Zip64 via the shared
// Zip64 helpers) and reads members with positioned reads — no whole-file load.
// Works over a file descriptor (`open`) or a Buffer (`fromBuffer`).

import { closeSync, fstatSync, openSync, readSync } from 'fs';
import { createHash } from 'crypto';
import { createInflateRaw, crc32 as zlibCrc32 } from 'zlib';
import { Readable, Transform, pipeline } from 'stream';
import {
  CENTRAL_DIR,
  CENTRAL_END,
  HDR_ID,
  LOCAL_HDR,
  ZIP64_CENTRAL_END,
} from '../core/constants/Headers';
import {
  asciiPathEqualsIgnoreCase,
  isReservedMetaPath,
} from '../core/constants/MetaPaths';
import { crc32 } from '../core/encryption/ZipCrypto';
import { getExtraField } from '../core/extra';
import {
  ZIP64_EOCD_RECORD_SIZE,
  ZIP64_LOCATOR_SIZE,
  ZIP64_U16,
  ZIP64_U32,
  parseZip64Eocd,
  parseZip64Extra,
  parseZip64Locator,
} from '../core/zip64/Zip64';
import { inflateZipPayloadSync } from './inflateZipPayload';
import { createDecompressTransform } from './ZstdNode';

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

export type ZipReaderEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
  /** Raw central-directory extra field bytes (including any Zip64 / 0x7075 records). */
  centralExtra: Buffer;
  /** General-purpose bit flags (bit 0 = encrypted, bit 11 = UTF-8 name). */
  flags: number;
  /** Central-directory file comment. */
  comment: string;
  externalAttr: number;
  internalAttr: number;
};

export type ZipReaderRaw = {
  method: number;
  compressed: Buffer;
  crc32: number;
  uncompressedSize: number;
  localExtra: Buffer;
  centralExtra: Buffer;
};

type ByteSource = {
  size: number;
  read(offset: number, length: number): Buffer;
  close(): void;
};

const STREAM_CHUNK = 64 * 1024;
const MAX_EOCD_SCAN = CENTRAL_END.SIZE + 0xffff;
const UNICODE_PATH_ID = HDR_ID.UNICODE_PATH;

function fdSource(fd: number): ByteSource {
  let open = true;
  return {
    size: fstatSync(fd).size,
    read(offset, length) {
      if (!open) throw new Error('ZipReaderNode is closed');
      const buf = Buffer.alloc(length);
      let got = 0;
      while (got < length) {
        const n = readSync(fd, buf, got, length - got, offset + got);
        if (n === 0) break;
        got += n;
      }
      if (got < length) {
        throw new ZipIntegrityError('structure', `unexpected end of file at offset ${offset + got}`);
      }
      return buf;
    },
    close() {
      if (open) {
        open = false;
        closeSync(fd);
      }
    },
  };
}

function bufferSource(buf: Buffer): ByteSource {
  let open = true;
  return {
    size: buf.length,
    read(offset, length) {
      if (!open) throw new Error('ZipReaderNode is closed');
      if (offset < 0 || offset + length > buf.length) {
        throw new ZipIntegrityError('structure', `read past end of archive at offset ${offset}`);
      }
      return buf.subarray(offset, offset + length);
    },
    close() {
      open = false;
    },
  };
}

export class ZipReaderNode {
  /** Total bytes requested from the underlying source (for I/O-budget tests). */
  preadBytes = 0;

  private readonly source: ByteSource;
  private readonly list: ZipReaderEntry[];
  private readonly byName = new Map<string, ZipReaderEntry>();

  private constructor(source: ByteSource) {
    this.source = {
      size: source.size,
      read: (offset, length) => {
        this.preadBytes += length;
        return source.read(offset, length);
      },
      close: () => source.close(),
    };
    try {
      this.list = this.parseCentralDirectory();
    } catch (err) {
      source.close();
      throw err;
    }
    for (const e of this.list) {
      if (!this.byName.has(e.name)) this.byName.set(e.name, e);
    }
  }

  /** Synchronously open `path`, parse the central directory, and keep the fd open. */
  static open(path: string): ZipReaderNode {
    const fd = openSync(path, 'r');
    try {
      return new ZipReaderNode(fdSource(fd));
    } catch (err) {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
      throw err;
    }
  }

  static fromBuffer(buf: Buffer): ZipReaderNode {
    return new ZipReaderNode(bufferSource(buf));
  }

  /** Archive size in bytes. */
  get size(): number {
    return this.source.size;
  }

  entries(): ZipReaderEntry[] {
    return this.list.slice();
  }

  /**
   * Look up by exact name. With `caseInsensitiveMeta`, a reserved `META-INF/*`
   * name (APPNOTE §1.3) also matches any ASCII case variant; more than one
   * variant present throws (malformed archive).
   */
  getEntry(name: string, opts?: { caseInsensitiveMeta?: boolean }): ZipReaderEntry | null {
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
  readEntry(entry: ZipReaderEntry | string, opts?: { skipHashCheck?: boolean }): Buffer {
    const e = this.resolve(entry);
    if (e.flags & 1) {
      throw new Error(`entry is encrypted (unsupported by ZipReaderNode): ${e.name}`);
    }
    const raw = this.readRaw(e);
    let out: Buffer;
    try {
      out = inflateZipPayloadSync(raw.method, raw.compressed);
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
      if ((crc32(out) >>> 0) !== (e.crc32 >>> 0)) {
        throw new ZipIntegrityError('crc', `${e.name}: CRC-32 mismatch`, e.name);
      }
      const expected = this.declaredSha256(e, raw.localExtra);
      if (expected.length > 0) {
        const actual = createHash('sha256').update(out).digest();
        if (expected.some((d) => !d.equals(actual))) {
          throw new ZipIntegrityError('sha256', `${e.name}: SHA-256 (0x014E) mismatch`, e.name);
        }
      }
    }
    return out;
  }

  /** Same as {@link readEntry}; currently delegates to the synchronous path. */
  async readEntryAsync(
    entry: ZipReaderEntry | string,
    opts?: { skipHashCheck?: boolean }
  ): Promise<Buffer> {
    return this.readEntry(entry, opts);
  }

  /**
   * Stream the uncompressed bytes. Stored, deflate and zstd members are read in
   * 64 KiB positioned reads and inflated incrementally; nothing is buffered
   * whole. Size, CRC-32 and 0x014E are checked at end of stream: a mismatch
   * surfaces as a {@link ZipIntegrityError} on the stream's `'error'` event
   * **after** the data was already emitted — consumers that act on bytes
   * before `'end'` must treat them as unverified.
   */
  openReadStream(entry: ZipReaderEntry | string): NodeJS.ReadableStream {
    const e = this.resolve(entry);
    if (e.flags & 1) {
      throw new Error(`entry is encrypted (unsupported by ZipReaderNode): ${e.name}`);
    }
    const loc = this.locateData(e);
    const read = (off: number, len: number): Buffer => this.source.read(off, len);
    const expectedSha = this.declaredSha256(e, loc.localExtra);

    async function* compressedChunks(): AsyncGenerator<Buffer> {
      let done = 0;
      while (done < e.compressedSize) {
        const n = Math.min(STREAM_CHUNK, e.compressedSize - done);
        yield Buffer.from(read(loc.dataStart + done, n));
        done += n;
      }
    }

    const stages: Array<NodeJS.ReadWriteStream> = [];
    if (e.method === 8) stages.push(createInflateRaw());
    else if (e.method === 93) stages.push(createDecompressTransform());
    else if (e.method !== 0) {
      throw new Error(`unsupported compression method ${e.method}`);
    }

    let crc = 0;
    let size = 0;
    const hash = createHash('sha256');
    const verifier = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        crc = zlibCrc32(chunk, crc);
        size += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
      flush(cb) {
        if (size !== e.uncompressedSize) {
          return cb(
            new ZipIntegrityError(
              'size',
              `${e.name}: expected ${e.uncompressedSize} bytes, got ${size}`,
              e.name
            )
          );
        }
        if ((crc >>> 0) !== (e.crc32 >>> 0)) {
          return cb(new ZipIntegrityError('crc', `${e.name}: CRC-32 mismatch`, e.name));
        }
        if (expectedSha.length > 0) {
          const actual = hash.digest();
          if (expectedSha.some((d) => !d.equals(actual))) {
            return cb(
              new ZipIntegrityError('sha256', `${e.name}: SHA-256 (0x014E) mismatch`, e.name)
            );
          }
        }
        cb();
      },
    });

    const source = Readable.from(compressedChunks(), { objectMode: false });
    const chain = [source, ...stages, verifier] as unknown as [Readable, ...NodeJS.ReadWriteStream[]];
    pipeline(chain as never, () => {
      /* errors are delivered on the returned verifier stream */
    });
    return verifier;
  }

  /** Raw stored bytes plus header metadata (no inflate, no verification). */
  readRaw(entry: ZipReaderEntry | string): ZipReaderRaw {
    const e = this.resolve(entry);
    const loc = this.locateData(e);
    const compressed = Buffer.from(this.source.read(loc.dataStart, e.compressedSize));
    return {
      method: e.method,
      compressed,
      crc32: e.crc32 >>> 0,
      uncompressedSize: e.uncompressedSize,
      localExtra: loc.localExtra,
      centralExtra: e.centralExtra,
    };
  }

  close(): void {
    this.source.close();
  }

  // ---- internals -------------------------------------------------------

  private resolve(entry: ZipReaderEntry | string): ZipReaderEntry {
    if (typeof entry !== 'string') return entry;
    const e = this.getEntry(entry);
    if (!e) throw new Error(`entry not found: ${entry}`);
    return e;
  }

  private declaredSha256(e: ZipReaderEntry, localExtra: Buffer): Buffer[] {
    const out: Buffer[] = [];
    for (const extra of [e.centralExtra, localExtra]) {
      const d = getExtraField(extra, HDR_ID.SHA256);
      if (d && d.length === 32) out.push(d);
    }
    return out;
  }

  private locateData(e: ZipReaderEntry): { dataStart: number; localExtra: Buffer } {
    const hdr = this.source.read(e.localHeaderOffset, LOCAL_HDR.SIZE);
    if (hdr.readUInt32LE(0) !== LOCAL_HDR.SIGNATURE) {
      throw new ZipIntegrityError(
        'structure',
        `${e.name}: bad local header signature at ${e.localHeaderOffset}`,
        e.name
      );
    }
    const nameLen = hdr.readUInt16LE(LOCAL_HDR.FNAME_LEN);
    const extraLen = hdr.readUInt16LE(LOCAL_HDR.EXTRA_LEN);
    const dataStart = e.localHeaderOffset + LOCAL_HDR.SIZE + nameLen + extraLen;
    if (dataStart + e.compressedSize > this.source.size) {
      throw new ZipIntegrityError('structure', `${e.name}: payload extends past end of archive`, e.name);
    }
    const localExtra =
      extraLen > 0
        ? Buffer.from(
            this.source.read(e.localHeaderOffset + LOCAL_HDR.SIZE + nameLen, extraLen)
          )
        : Buffer.alloc(0);
    return { dataStart, localExtra };
  }

  private parseCentralDirectory(): ZipReaderEntry[] {
    const size = this.source.size;
    if (size < CENTRAL_END.SIZE) {
      throw new ZipIntegrityError('structure', 'not a ZIP archive (too small)');
    }
    // Common case: no archive comment → EOCD is in the last 22 bytes. Widen only if needed.
    let tailLen = 0;
    let tailStart = 0;
    let tail: Buffer = Buffer.alloc(0);
    let eocd = -1;
    for (const window of [CENTRAL_END.SIZE + 256, MAX_EOCD_SCAN]) {
      const want = Math.min(size, window);
      if (want <= tailLen) break;
      tailLen = want;
      tailStart = size - tailLen;
      tail = this.source.read(tailStart, tailLen);
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
        const loc = this.source.read(eocdAbs - ZIP64_LOCATOR_SIZE, ZIP64_LOCATOR_SIZE);
        if (loc.readUInt32LE(0) === ZIP64_CENTRAL_END.SIGNATURE) {
          const z64Offset = parseZip64Locator(loc);
          const z64 = parseZip64Eocd(this.source.read(z64Offset, ZIP64_EOCD_RECORD_SIZE));
          total = z64.totalEntries;
          cdSize = z64.centralDirSize;
          cdOffset = z64.centralDirOffset;
        }
      }
    }

    if (cdOffset + cdSize > size) {
      throw new ZipIntegrityError('structure', 'central directory extends past end of archive');
    }
    const cd = cdSize > 0 ? this.source.read(cdOffset, cdSize) : Buffer.alloc(0);

    const out: ZipReaderEntry[] = [];
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
      const internalAttr = cd.readUInt16LE(pos + CENTRAL_DIR.INT_FILE_ATTR);
      const externalAttr = cd.readUInt32LE(pos + CENTRAL_DIR.EXT_FILE_ATTR);
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

      const up = getExtraField(centralExtra, UNICODE_PATH_ID);
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
        comment: cd.toString('utf8', commentStart, next),
        externalAttr,
        internalAttr,
      });
      pos = next;
    }
    return out;
  }
}
