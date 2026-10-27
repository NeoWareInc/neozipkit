import {
  addProfile,
  checkPairing,
  classifyEntry,
  clearRegisteredBlocks,
  compareSpecVersion,
  createManifest,
  getRegisteredBlocks,
  parseManifestJson,
  registerManifestBlock,
  removeProfile,
  serializeManifest,
  validateManifest,
  validateManifestBlocks,
} from '../../../src/core/manifest';
import { validateReservedMeta } from '../../../src/core/constants/MetaPaths';

const AT = '2026-10-27T00:00:00.000Z';

describe('manifest envelope', () => {
  test('createManifest + validate round-trip', () => {
    const m = createManifest({ specVersion: '0.3.0', profiles: ['integrity'], createdAt: AT });
    const v = validateManifest(m);
    expect(v.ok).toBe(true);
    expect(m).toEqual({ format: 'neozip', specVersion: '0.3.0', createdAt: AT, profiles: ['integrity'] });
  });

  test('validate reports each missing / bad field and keeps unknown keys', () => {
    const bad = validateManifest({ format: 'zip', profiles: 'x' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join('\n')).toMatch(/format/);
      expect(bad.errors.join('\n')).toMatch(/specVersion/);
      expect(bad.errors.join('\n')).toMatch(/createdAt/);
      expect(bad.errors.join('\n')).toMatch(/profiles/);
    }
    expect(validateManifest([]).ok).toBe(false);
    expect(validateManifest({ format: 'neozip', specVersion: '1', createdAt: 'nope' }).ok).toBe(false);

    const keep = validateManifest({ format: 'neozip', specVersion: '0.3.0', createdAt: AT, future: { a: 1 } });
    expect(keep.ok && keep.value.future).toEqual({ a: 1 });
  });

  test('serialize uses stable key order', () => {
    const text = serializeManifest({
      zeta: 1,
      alpha: { z: 1, a: 2 },
      createdAt: AT,
      profiles: ['b', 'a'],
      specVersion: '0.3.0',
      format: 'neozip',
    });
    expect(Object.keys(JSON.parse(text))).toEqual([
      'format',
      'specVersion',
      'createdAt',
      'profiles',
      'alpha',
      'zeta',
    ]);
    expect(text.endsWith('\n')).toBe(true);
    // deterministic
    expect(serializeManifest(parseManifestJson(text))).toBe(text);
  });

  test('parseManifestJson validates and tolerates a BOM', () => {
    const text = '\uFEFF' + serializeManifest(createManifest({ specVersion: '0.3.0', createdAt: AT }));
    expect(parseManifestJson(text).specVersion).toBe('0.3.0');
    expect(() => parseManifestJson('{')).toThrow(/not valid JSON/);
    expect(() => parseManifestJson('{}')).toThrow(/invalid manifest/);
  });

  test('add/removeProfile are idempotent and immutable', () => {
    const m = createManifest({ specVersion: '0.3.0', createdAt: AT });
    const a = addProfile(addProfile(m, 'zipwiki'), 'zipwiki');
    expect(a.profiles).toEqual(['zipwiki']);
    expect(m.profiles).toBeUndefined();
    const r = removeProfile(removeProfile(a, 'zipwiki'), 'zipwiki');
    expect('profiles' in r).toBe(false);
    expect(removeProfile(addProfile(a, 'x'), 'x').profiles).toEqual(['zipwiki']);
  });
});

describe('manifest blocks', () => {
  afterEach(() => clearRegisteredBlocks());

  test('register, list, and validate', () => {
    registerManifestBlock('ai', {
      minSpecVersion: '0.2.0',
      requiredProfiles: ['zipwiki'],
      validate: (v) => (typeof (v as { root?: unknown }).root === 'string' ? [] : ['root required']),
    });
    expect(getRegisteredBlocks().has('ai')).toBe(true);

    const base = createManifest({ specVersion: '0.1.1', createdAt: AT });
    expect(validateManifestBlocks(base)).toEqual([]); // absent block ignored
    const errs = validateManifestBlocks({ ...base, ai: {} });
    expect(errs.join('\n')).toMatch(/requires specVersion >= 0.2.0/);
    expect(errs.join('\n')).toMatch(/requires profile "zipwiki"/);
    expect(errs.join('\n')).toMatch(/root required/);

    const ok = createManifest({ specVersion: '0.3.0-draft', profiles: ['zipwiki'], createdAt: AT });
    expect(validateManifestBlocks({ ...ok, ai: { root: 'wiki' } })).toEqual([]);
  });

  test('compareSpecVersion ignores pre-release suffix', () => {
    expect(compareSpecVersion('0.3.0-draft', '0.3.0')).toBe(0);
    expect(compareSpecVersion('0.2.9', '0.3.0')).toBe(-1);
    expect(compareSpecVersion('1.0.0', '0.9.9')).toBe(1);
  });
});

describe('classify + pairing', () => {
  test('classifyEntry per APPNOTE §3.1', () => {
    expect(classifyEntry('META-INF/manifest.json', 'wiki')).toBe('meta');
    expect(classifyEntry('meta-inf/token.nzip')).toBe('meta');
    expect(classifyEntry('wiki/okf/index.md', 'wiki')).toBe('ai-namespace');
    expect(classifyEntry('wiki/okf/index.md')).toBe('primary');
    expect(classifyEntry('wikipedia/x.md', 'wiki')).toBe('primary');
    expect(classifyEntry('Wiki/x.md', 'wiki')).toBe('primary');
    expect(classifyEntry('report.pdf', 'wiki')).toBe('primary');
  });

  const manifest = (ai: unknown) => ({
    ...createManifest({ specVersion: '0.3.0', createdAt: AT }),
    ai,
  });
  const names = (...n: string[]) => n.map((name) => ({ name }));

  test('paired parse is ok', () => {
    const r = checkPairing(
      names('META-INF/manifest.json', 'a.pdf', 'wiki/parsed/a.pdf.md', 'wiki/parsed/a.pdf.assets/i.png'),
      manifest({ root: 'wiki' })
    );
    expect(r).toEqual({ ok: true, orphans: [], notes: [] });
  });

  test('orphan parse fails unless the primary was omitted on purpose', () => {
    const entries = names('wiki/parsed/a.pdf.md', 'wiki/parsed/sub/b.docx.md', 'c.txt');
    const orphan = checkPairing(entries, manifest({ root: 'wiki' }));
    expect(orphan.ok).toBe(false);
    expect(orphan.orphans).toEqual(['wiki/parsed/a.pdf.md', 'wiki/parsed/sub/b.docx.md']);

    const omitted = checkPairing(
      entries,
      manifest({
        root: 'wiki',
        primaries: [
          { path: 'a.pdf', sourceIncluded: false },
          { path: 'sub/b.docx', sourceIncluded: true },
        ],
      })
    );
    expect(omitted.orphans).toEqual(['wiki/parsed/sub/b.docx.md']);
  });

  test('assets without a parse are noted; orphan assets fail', () => {
    const r = checkPairing(
      names('a.pdf', 'wiki/parsed/a.pdf.assets/i.png', 'wiki/parsed/z.pdf.assets/j.png'),
      manifest({ root: 'wiki' })
    );
    expect(r.ok).toBe(false);
    expect(r.orphans).toEqual(['wiki/parsed/z.pdf.assets/j.png']);
    expect(r.notes.join('\n')).toMatch(/a\.pdf/);
  });

  test('no ai root → nothing to pair', () => {
    const r = checkPairing(names('a.txt'), createManifest({ specVersion: '0.3.0', createdAt: AT }));
    expect(r.ok).toBe(true);
    expect(r.notes.length).toBe(1);
  });
});

describe('validateReservedMeta', () => {
  test('accepts distinct reserved names and plain duplicates of non-reserved paths', () => {
    expect(() =>
      validateReservedMeta([
        { name: 'META-INF/manifest.json' },
        { filename: 'META-INF/TOKEN.NZIP' },
        { name: 'a.txt' },
        { name: 'a.txt' },
      ])
    ).not.toThrow();
  });

  test('rejects case-variant and duplicate reserved names', () => {
    expect(() =>
      validateReservedMeta([{ name: 'META-INF/manifest.json' }, { name: 'meta-inf/MANIFEST.JSON' }])
    ).toThrow(/both/);
    expect(() =>
      validateReservedMeta([{ filename: 'META-INF/TOKEN.NZIP' }, { filename: 'META-INF/TOKEN.NZIP' }])
    ).toThrow(/duplicate/);
  });
});
