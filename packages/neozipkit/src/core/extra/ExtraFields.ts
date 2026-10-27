// ======================================
//  ExtraFields.ts — ZIP Extra Field registry helpers
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// A flat extra-field blob is a sequence of records:
//   id (u16 LE) | size (u16 LE) | data[size]
// These helpers parse, compose, replace and look up records without knowing
// what any particular id means (0x014E, 0x014F, 0x7075, …).

export type ExtraFieldRecord = { id: number; data: Buffer };

/** Largest `data` payload a single extra-field record can carry. */
export const EXTRA_FIELD_MAX_DATA = 0xffff;

/**
 * Split an extra-field blob into `{ id, data }` records, in wire order.
 * A truncated trailing record is ignored (never throws). `data` is a copy.
 */
export function parseExtraFields(buf: Buffer | null | undefined): ExtraFieldRecord[] {
  const out: ExtraFieldRecord[] = [];
  if (!buf || buf.length < 4) return out;
  let i = 0;
  while (i + 4 <= buf.length) {
    const id = buf.readUInt16LE(i);
    const size = buf.readUInt16LE(i + 2);
    i += 4;
    if (i + size > buf.length) break;
    out.push({ id, data: Buffer.from(buf.subarray(i, i + size)) });
    i += size;
  }
  return out;
}

function encodeRecord(rec: ExtraFieldRecord): Buffer {
  if (!Number.isInteger(rec.id) || rec.id < 0 || rec.id > 0xffff) {
    throw new Error(`extra field id out of range: ${rec.id}`);
  }
  if (rec.data.length > EXTRA_FIELD_MAX_DATA) {
    throw new Error(
      `extra field 0x${rec.id.toString(16).padStart(4, '0')} data exceeds ${EXTRA_FIELD_MAX_DATA} bytes`
    );
  }
  const out = Buffer.alloc(4 + rec.data.length);
  out.writeUInt16LE(rec.id, 0);
  out.writeUInt16LE(rec.data.length, 2);
  rec.data.copy(out, 4);
  return out;
}

/**
 * Concatenate extra-field parts into one blob.
 *
 * Each part is either a complete blob (`Buffer` of one or more records) or a
 * single `{ id, data }` record. `null` / `undefined` parts are skipped.
 *
 * **Duplicate ids: the last part wins.** An earlier record with the same id is
 * dropped and the later one keeps its (later) position, so
 * `composeExtraFields(base, override)` yields `base` minus any ids present in
 * `override`, followed by `override`'s records. Order is otherwise preserved.
 */
export function composeExtraFields(
  ...parts: Array<Buffer | ExtraFieldRecord | null | undefined>
): Buffer {
  const records: ExtraFieldRecord[] = [];
  for (const part of parts) {
    if (part === null || part === undefined) continue;
    if (Buffer.isBuffer(part)) {
      records.push(...parseExtraFields(part));
    } else {
      records.push({ id: part.id, data: part.data });
    }
  }
  // Last occurrence of each id wins.
  const lastIndex = new Map<number, number>();
  records.forEach((r, idx) => lastIndex.set(r.id, idx));
  const kept = records.filter((r, idx) => lastIndex.get(r.id) === idx);
  return Buffer.concat(kept.map(encodeRecord));
}

/**
 * Replace (or append) the record `id` in `buf`. Pass `data: null` to remove it.
 * Every existing record with that id is removed; a replacement is appended at
 * the position of the first removed record, or at the end when none existed.
 */
export function replaceExtraField(
  buf: Buffer | null | undefined,
  id: number,
  data: Buffer | null
): Buffer {
  const records = parseExtraFields(buf);
  const out: ExtraFieldRecord[] = [];
  let placed = false;
  for (const rec of records) {
    if (rec.id !== id) {
      out.push(rec);
      continue;
    }
    if (data !== null && !placed) {
      out.push({ id, data });
      placed = true;
    }
  }
  if (data !== null && !placed) out.push({ id, data });
  return Buffer.concat(out.map(encodeRecord));
}

/** First record payload for `id`, or null. */
export function getExtraField(buf: Buffer | null | undefined, id: number): Buffer | null {
  for (const rec of parseExtraFields(buf)) {
    if (rec.id === id) return rec.data;
  }
  return null;
}
