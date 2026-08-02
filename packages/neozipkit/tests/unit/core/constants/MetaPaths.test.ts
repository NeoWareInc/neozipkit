import {
  findReservedMetaEntry,
  asciiPathEqualsIgnoreCase,
  isMetaInfPath,
  isReservedMetaPath,
  META_TOKEN_NZIP,
  META_TIMESTAMP_NZIP,
  META_TS_SUBMIT_NZIP,
} from '../../../../src/core/constants/MetaPaths';

describe('MetaPaths (NEOZIP_APPNOTE §2.3)', () => {
  it('folds ASCII case for reserved paths', () => {
    expect(asciiPathEqualsIgnoreCase('META-INF/TOKEN.NZIP', 'meta-inf/token.nzip')).toBe(true);
    expect(isReservedMetaPath('meta-inf/Timestamp.NZIP')).toBe(true);
    expect(isMetaInfPath('Meta-Inf/foo.txt')).toBe(true);
    expect(isMetaInfPath('content/foo.txt')).toBe(false);
  });

  it('prefers exact canonical match over differently cased duplicate', () => {
    const entries = [
      { filename: 'meta-inf/token.nzip' },
      { filename: META_TOKEN_NZIP },
    ];
    const hit = findReservedMetaEntry(entries, META_TOKEN_NZIP);
    expect(hit?.filename).toBe(META_TOKEN_NZIP);
  });

  it('finds timestamp entries case-insensitively with preference order', () => {
    const entries = [{ filename: 'META-INF/ts-submit.nzip' }];
    const hit = findReservedMetaEntry(entries, [META_TIMESTAMP_NZIP, META_TS_SUBMIT_NZIP]);
    expect(hit?.filename).toBe('META-INF/ts-submit.nzip');
  });
});
