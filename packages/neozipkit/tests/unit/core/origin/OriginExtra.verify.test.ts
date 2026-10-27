import {
  originCrc32Of,
  originSha256Of,
  verifyOriginPayload,
} from '../../../../src/core/origin/OriginExtra';

describe('verifyOriginPayload', () => {
  const bytes = Buffer.from('original bytes');

  test('null for tags that are absent', () => {
    expect(verifyOriginPayload({ uri: 'https://example.org/a' }, bytes)).toEqual({
      crcOk: null,
      sizeOk: null,
      sha256Ok: null,
    });
  });

  test('true when every declared attribute matches', () => {
    const loc = {
      crc32: originCrc32Of(bytes),
      size: bytes.length,
      sha256: originSha256Of(bytes),
    };
    expect(verifyOriginPayload(loc, bytes)).toEqual({ crcOk: true, sizeOk: true, sha256Ok: true });
  });

  test('accepts hex sha256 and reports each mismatch independently', () => {
    const other = Buffer.from('different!!!!!');
    const loc = {
      crc32: originCrc32Of(bytes),
      size: bytes.length,
      sha256: originSha256Of(bytes).toString('hex'),
    };
    expect(verifyOriginPayload(loc, other)).toEqual({ crcOk: false, sizeOk: true, sha256Ok: false });
    expect(verifyOriginPayload({ size: 1 }, bytes)).toEqual({
      crcOk: null,
      sizeOk: false,
      sha256Ok: null,
    });
  });
});
