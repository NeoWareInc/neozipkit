import {
  composeExtraFields,
  getExtraField,
  parseExtraFields,
  replaceExtraField,
} from '../../../src/core/extra';

const rec = (id: number, ...bytes: number[]) => ({ id, data: Buffer.from(bytes) });

describe('extra field registry', () => {
  test('compose + parse round-trip', () => {
    const blob = composeExtraFields(rec(0x014e, 1, 2), rec(0x014f, 3));
    expect(parseExtraFields(blob)).toEqual([rec(0x014e, 1, 2), rec(0x014f, 3)]);
  });

  test('accepts blobs, skips null/undefined', () => {
    const a = composeExtraFields(rec(1, 9));
    const b = composeExtraFields(a, null, undefined, rec(2, 8));
    expect(parseExtraFields(b).map((r) => r.id)).toEqual([1, 2]);
  });

  test('later parts win on duplicate ids and keep the later position', () => {
    const base = composeExtraFields(rec(1, 1), rec(2, 2), rec(3, 3));
    const out = composeExtraFields(base, rec(2, 99));
    expect(parseExtraFields(out)).toEqual([rec(1, 1), rec(3, 3), rec(2, 99)]);
  });

  test('parse ignores truncated trailing record and empty input', () => {
    expect(parseExtraFields(null)).toEqual([]);
    expect(parseExtraFields(Buffer.alloc(0))).toEqual([]);
    const good = composeExtraFields(rec(5, 1, 2, 3));
    const truncated = Buffer.concat([good, Buffer.from([0x06, 0x00, 0x09, 0x00, 0x01])]);
    expect(parseExtraFields(truncated)).toEqual([rec(5, 1, 2, 3)]);
  });

  test('getExtraField returns payload or null', () => {
    const blob = composeExtraFields(rec(7, 4, 5));
    expect(getExtraField(blob, 7)).toEqual(Buffer.from([4, 5]));
    expect(getExtraField(blob, 8)).toBeNull();
    expect(getExtraField(undefined, 7)).toBeNull();
  });

  test('replaceExtraField replaces in place, appends, and removes', () => {
    const blob = composeExtraFields(rec(1, 1), rec(2, 2), rec(3, 3));
    expect(parseExtraFields(replaceExtraField(blob, 2, Buffer.from([7])))).toEqual([
      rec(1, 1),
      rec(2, 7),
      rec(3, 3),
    ]);
    expect(parseExtraFields(replaceExtraField(blob, 9, Buffer.from([9])))).toEqual([
      rec(1, 1),
      rec(2, 2),
      rec(3, 3),
      rec(9, 9),
    ]);
    expect(parseExtraFields(replaceExtraField(blob, 2, null))).toEqual([rec(1, 1), rec(3, 3)]);
    expect(replaceExtraField(null, 2, null).length).toBe(0);
  });

  test('rejects oversize payloads and bad ids', () => {
    expect(() => composeExtraFields({ id: 1, data: Buffer.alloc(0x10000) })).toThrow(/exceeds/);
    expect(() => composeExtraFields({ id: 0x10000, data: Buffer.alloc(0) })).toThrow(/out of range/);
  });
});
