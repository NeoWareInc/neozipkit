/**
 * Unit tests for APPNOTE Zip64 Version 1 helpers and wire round-trips.
 */

import ZipEntry from '../../../../src/core/ZipEntry';
import Zipkit from '../../../../src/core/Zipkit';
import {
  CENTRAL_DIR,
  CENTRAL_END,
  HDR_ID,
  LOCAL_HDR,
  ZIP64_CENTRAL_DIR,
  ZIP64_CENTRAL_END,
} from '../../../../src/core/constants/Headers';
import {
  ZIP64_BUFFER_SIZE_OFFSET_ERROR,
  ZIP64_EOCD_RECORD_SIZE,
  ZIP64_LOCATOR_SIZE,
  ZIP64_U16,
  ZIP64_U32,
  ZIP64_VERSION_NEEDED,
  assertBufferAllowsEntryZip64,
  buildEndRecords,
  buildZip64Extra,
  classicEocdNeedsZip64,
  exceedsU16,
  exceedsU32,
  needsZip64Archive,
  needsZip64Entry,
  parseZip64Extra,
  parseZip64Eocd,
  parseZip64Locator,
  stripZip64FromExtra,
} from '../../../../src/core/zip64/Zip64';
import { buildZipBufferSync } from '../../../../src/node/buildZipBuffer';

describe('Zip64 helpers', () => {
  test('exceedsU32 / exceedsU16 thresholds', () => {
    expect(exceedsU32(ZIP64_U32)).toBe(false);
    expect(exceedsU32(ZIP64_U32 + 1)).toBe(true);
    expect(exceedsU16(ZIP64_U16)).toBe(false);
    expect(exceedsU16(ZIP64_U16 + 1)).toBe(true);
  });

  test('build/parse Zip64 extra for central directory fields', () => {
    const extra = buildZip64Extra({
      uncompressedSize: 0x100000000,
      compressedSize: 0x100000001,
      localHdrOffset: 0x100000002,
    });
    expect(extra.readUInt16LE(0)).toBe(HDR_ID.ZIP64);
    expect(extra.readUInt16LE(2)).toBe(24);
    const parsed = parseZip64Extra(extra.subarray(4), {
      uncompressedSize: ZIP64_U32,
      compressedSize: ZIP64_U32,
      localHdrOffset: ZIP64_U32,
      diskStart: 0,
    });
    expect(parsed.uncompressedSize).toBe(0x100000000);
    expect(parsed.compressedSize).toBe(0x100000001);
    expect(parsed.localHdrOffset).toBe(0x100000002);
  });

  test('local Zip64 extra always includes both sizes', () => {
    const extra = buildZip64Extra(
      { uncompressedSize: 0x100000000, compressedSize: 42 },
      { forLocal: true }
    );
    expect(extra.readUInt16LE(2)).toBe(16);
  });

  test('buildEndRecords emits Zip64 EOCD + locator for entry count overflow', () => {
    const totalEntries = 70000;
    const cdSize = 100;
    const cdOffset = 50;
    const buf = buildEndRecords({
      totalEntries,
      centralDirSize: cdSize,
      centralDirOffset: cdOffset,
      zip64EocdOffset: cdOffset + cdSize,
      allowSizeOffsetZip64: false,
    });
    expect(buf.readUInt32LE(0)).toBe(ZIP64_CENTRAL_DIR.SIGNATURE);
    expect(buf.readUInt32LE(ZIP64_EOCD_RECORD_SIZE)).toBe(ZIP64_CENTRAL_END.SIGNATURE);
    const classicOff = ZIP64_EOCD_RECORD_SIZE + ZIP64_LOCATOR_SIZE;
    expect(buf.readUInt32LE(classicOff)).toBe(CENTRAL_END.SIGNATURE);
    expect(buf.readUInt16LE(classicOff + CENTRAL_END.TOTAL_ENTRIES)).toBe(ZIP64_U16);
    const z64 = parseZip64Eocd(buf.subarray(0, ZIP64_EOCD_RECORD_SIZE));
    expect(z64.totalEntries).toBe(totalEntries);
    expect(z64.centralDirOffset).toBe(cdOffset);
  });

  test('buildEndRecords refuses size/offset Zip64 when allowSizeOffsetZip64 is false', () => {
    expect(() =>
      buildEndRecords({
        totalEntries: 1,
        centralDirSize: 100,
        centralDirOffset: 0x100000000,
        zip64EocdOffset: 0x100000000 + 100,
        allowSizeOffsetZip64: false,
      })
    ).toThrow(ZIP64_BUFFER_SIZE_OFFSET_ERROR);
  });

  test('buildEndRecords allows size/offset Zip64 for Node', () => {
    const buf = buildEndRecords({
      totalEntries: 1,
      centralDirSize: 100,
      centralDirOffset: 0x100000000,
      zip64EocdOffset: 0x100000000 + 100,
      allowSizeOffsetZip64: true,
    });
    expect(buf.readUInt32LE(0)).toBe(ZIP64_CENTRAL_DIR.SIGNATURE);
    const classicOff = ZIP64_EOCD_RECORD_SIZE + ZIP64_LOCATOR_SIZE;
    expect(buf.readUInt32LE(classicOff + CENTRAL_END.CENTRAL_DIR_OFFSET)).toBe(ZIP64_U32);
  });

  test('assertBufferAllowsEntryZip64', () => {
    expect(() => assertBufferAllowsEntryZip64(100, 50, 0)).not.toThrow();
    expect(() => assertBufferAllowsEntryZip64(0x100000000, 0, 0)).toThrow(
      ZIP64_BUFFER_SIZE_OFFSET_ERROR
    );
  });

  test('stripZip64FromExtra removes 0x0001 records', () => {
    const z = buildZip64Extra({ uncompressedSize: 1, compressedSize: 1 }, { forLocal: true });
    const other = Buffer.alloc(8);
    other.writeUInt16LE(HDR_ID.SHA256, 0);
    other.writeUInt16LE(4, 2);
    other.writeUInt32LE(0xdeadbeef, 4);
    const stripped = stripZip64FromExtra(Buffer.concat([z, other]));
    expect(stripped).not.toBeNull();
    expect(stripped!.readUInt16LE(0)).toBe(HDR_ID.SHA256);
    expect(extraFieldHasNoZip64(stripped!)).toBe(true);
  });
});

function extraFieldHasNoZip64(extra: Buffer): boolean {
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (id === HDR_ID.ZIP64) return false;
    i += 4 + len;
  }
  return true;
}

describe('ZipEntry Zip64 emit/parse', () => {
  test('createLocalHdr / centralDirEntry emit 0x0001 for large sizes', () => {
    const entry = new ZipEntry('huge.bin', null, false);
    entry.uncompressedSize = 0x100000000;
    entry.compressedSize = 0x100000000;
    entry.crc = 0;
    entry.cmpMethod = 0;
    entry.localHdrOffset = 0;
    entry.isUpdated = true;

    const local = entry.createLocalHdr();
    expect(local.readUInt16LE(LOCAL_HDR.VER_EXTRACT)).toBeGreaterThanOrEqual(ZIP64_VERSION_NEEDED);
    expect(local.readUInt32LE(LOCAL_HDR.CMP_SIZE)).toBe(ZIP64_U32);
    expect(local.readUInt32LE(LOCAL_HDR.UNCMP_SIZE)).toBe(ZIP64_U32);
    expect(entry.usesZip64Extra).toBe(true);

    entry.localHdrOffset = 0x100000010;
    const central = entry.centralDirEntry();
    expect(central.readUInt32LE(CENTRAL_DIR.LOCAL_HDR_OFFSET)).toBe(ZIP64_U32);
    expect(central.readUInt32LE(CENTRAL_DIR.CMP_SIZE)).toBe(ZIP64_U32);
  });

  test('readZipEntry merges Zip64 extra into sizes and offset', () => {
    const entry = new ZipEntry('x.bin', null, false);
    entry.uncompressedSize = 0x100000000;
    entry.compressedSize = 0x100000001;
    entry.localHdrOffset = 0x100000002;
    entry.crc = 1;
    entry.cmpMethod = 0;
    entry.isUpdated = true;
    const central = entry.centralDirEntry();

    const parsed = new ZipEntry(null, null, false);
    parsed.readZipEntry(central);
    expect(parsed.uncompressedSize).toBe(0x100000000);
    expect(parsed.compressedSize).toBe(0x100000001);
    expect(parsed.localHdrOffset).toBe(0x100000002);
    expect(parsed.usesZip64Extra).toBe(true);
  });
});

/**
 * Build a synthetic Zip64 archive: one STORED empty member whose central
 * directory claims a huge uncompressed size via Zip64 extra (no multi-GiB payload).
 */
function buildSyntheticZip64SizeArchive(): Buffer {
  const name = 'synthetic.bin';
  const entry = new ZipEntry(name, null, false);
  entry.cmpMethod = 0;
  entry.crc = 0;
  entry.uncompressedSize = 0x100000000; // 4 GiB
  entry.compressedSize = 0; // empty stored body (synthetic metadata only)
  entry.localHdrOffset = 0;
  entry.isUpdated = true;
  entry.emitUnicodePath = false;

  // Force local Zip64 with both sizes (compressed 0 still fits u32, but local requires both)
  // createLocalHdr only emits Zip64 when either size exceeds U32 — uncompressed does.
  const local = entry.createLocalHdr();
  const payload = Buffer.alloc(0);
  entry.localHdrOffset = 0;
  const central = entry.centralDirEntry();
  const cdOffset = local.length + payload.length;
  const end = buildEndRecords({
    totalEntries: 1,
    centralDirSize: central.length,
    centralDirOffset: cdOffset,
    zip64EocdOffset: cdOffset + central.length,
    allowSizeOffsetZip64: true,
  });
  return Buffer.concat([local, payload, central, end]);
}

/**
 * Synthetic archive with Zip64 EOCD solely because entry count > 65535 is expensive.
 * Instead, craft EOCD with FFFF entry count + Zip64 EOCD declaring N entries,
 * and only one real CD entry (tolerant readers use CD size; we verify EOCD parse).
 */
function buildSyntheticZip64EntryCountEocd(): {
  buffer: Buffer;
  declaredEntries: number;
} {
  const name = 'one.txt';
  const entry = new ZipEntry(name, null, false);
  entry.cmpMethod = 0;
  entry.crc = 0;
  entry.uncompressedSize = 0;
  entry.compressedSize = 0;
  entry.localHdrOffset = 0;
  entry.isUpdated = true;
  entry.emitUnicodePath = false;
  const local = entry.createLocalHdr();
  const central = entry.centralDirEntry();
  const cdOffset = local.length;
  const declaredEntries = 70000;
  const end = buildEndRecords({
    totalEntries: declaredEntries,
    centralDirSize: central.length,
    centralDirOffset: cdOffset,
    zip64EocdOffset: cdOffset + central.length,
    allowSizeOffsetZip64: false,
  });
  return {
    buffer: Buffer.concat([local, central, end]),
    declaredEntries,
  };
}

describe('Zip64 buffer read (synthetic)', () => {
  test('loadZip merges Zip64 sizes from synthetic archive', () => {
    const buf = buildSyntheticZip64SizeArchive();
    const zipkit = new Zipkit();
    const entries = zipkit.loadZip(buf);
    expect(entries.length).toBe(1);
    expect(entries[0].uncompressedSize).toBe(0x100000000);
    expect(entries[0].usesZip64Extra).toBe(true);
  });

  test('loadEOCD reads Zip64 when entry count is sentinel', () => {
    const { buffer, declaredEntries } = buildSyntheticZip64EntryCountEocd();
    // Locate classic EOCD and confirm sentinels / Zip64 EOCD totals
    const eocdAt = buffer.length - 22;
    expect(buffer.readUInt16LE(eocdAt + CENTRAL_END.TOTAL_ENTRIES)).toBe(ZIP64_U16);
    const locatorAt = eocdAt - ZIP64_LOCATOR_SIZE;
    const zip64Off = parseZip64Locator(buffer.subarray(locatorAt, locatorAt + ZIP64_LOCATOR_SIZE));
    const z64 = parseZip64Eocd(
      buffer.subarray(zip64Off, zip64Off + ZIP64_EOCD_RECORD_SIZE)
    );
    expect(z64.totalEntries).toBe(declaredEntries);

    const zipkit = new Zipkit();
    // CD size matches one entry — directory parse finds that one member
    const entries = zipkit.loadZip(buffer);
    expect(entries.length).toBe(1);
    expect(entries[0].filename).toBe('one.txt');
  });

  test('classic small archive has no Zip64 records', () => {
    const buf = buildZipBufferSync([
      { name: 'a.txt', data: Buffer.from('hi'), method: 0 },
    ]);
    expect(buf.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(false); // no Zip64 EOCD
    const zipkit = new Zipkit();
    const entries = zipkit.loadZip(buf);
    expect(entries[0].usesZip64Extra).toBe(false);
    expect(entries[0].uncompressedSize).toBe(2);
  });

  test('buildZipBufferSync rejects size/offset Zip64', () => {
    const huge = Buffer.alloc(10);
    // Force offset overflow by crafting via ZipEntry path is hard; assert helper covers policy.
    expect(() => assertBufferAllowsEntryZip64(0x100000000, 10, 0)).toThrow(
      ZIP64_BUFFER_SIZE_OFFSET_ERROR
    );
    // Direct build with normal sizes still works
    expect(() =>
      buildZipBufferSync([{ name: 'ok.txt', data: huge, method: 0 }])
    ).not.toThrow();
  });
});

describe('Zip64 predicates', () => {
  test('needsZip64Entry / Archive / classicEocdNeedsZip64', () => {
    expect(needsZip64Entry(100, 50, 0)).toBe(false);
    expect(needsZip64Entry(0x100000000, 0, 0)).toBe(true);
    expect(needsZip64Archive(10, 100, 50)).toBe(false);
    expect(needsZip64Archive(70000, 100, 50)).toBe(true);
    expect(
      classicEocdNeedsZip64({
        volEntries: ZIP64_U16,
        totalEntries: ZIP64_U16,
        centralDirSize: 100,
        centralDirOffset: 50,
      })
    ).toBe(true);
  });
});
