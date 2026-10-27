/**
 * Sidecar builders + writeSidecars (archive-agnostic, no network).
 */

import * as fs from 'fs';
import { ZipReaderNode, getExtraField, HDR_ID, readManifest } from 'neozipkit/node';
import {
  buildSubmitSidecar,
  buildTimestampSidecar,
  buildTokenSidecar,
  writeSidecars,
  conflictingSidecars,
} from '../../src/sidecars';
import {
  buildZipwikiFixture,
  tmpArchive,
  rmTmp,
  entryNames,
  readText,
  DOC_TEXT,
} from '../helpers/zipwikiFixture';

const SUBMIT = 'META-INF/TS-SUBMIT.NZIP';
const TIMESTAMP = 'META-INF/TIMESTAMP.NZIP';
const TOKEN = 'META-INF/TOKEN.NZIP';

describe('sidecar builders', () => {
  const meta = { digest: 'ab'.repeat(32), network: 'base-sepolia', n: 1, nested: { ü: 'é' } };

  it.each([
    ['submit', buildSubmitSidecar, SUBMIT],
    ['timestamp', buildTimestampSidecar, TIMESTAMP],
    ['token', buildTokenSidecar, TOKEN],
  ] as const)('%s builder uses the right META-INF name and JSON UTF-8', (_k, build, name) => {
    const sc = build(meta);
    expect(sc.name).toBe(name);
    expect(Buffer.isBuffer(sc.bytes)).toBe(true);
    expect(JSON.parse(sc.bytes.toString('utf8'))).toEqual(meta);
    // UTF-8, not escaped: the "é" survives as two bytes.
    expect(sc.bytes.includes(Buffer.from('é', 'utf8'))).toBe(true);
  });

  it('rejects non-object metadata', () => {
    expect(() => buildSubmitSidecar([] as unknown as object)).toThrow(/JSON object/);
    expect(() => buildTokenSidecar(null as unknown as object)).toThrow(/JSON object/);
  });
});

describe('conflictingSidecars', () => {
  it('follows AppNote §8.4/§8.6', () => {
    expect(conflictingSidecars([SUBMIT]).sort()).toEqual(
      [TIMESTAMP, TOKEN, 'META-INF/NZIP.TOKEN'].sort()
    );
    expect(conflictingSidecars([TIMESTAMP])).toEqual([SUBMIT]);
    expect(conflictingSidecars([TOKEN]).sort()).toEqual([SUBMIT, 'META-INF/NZIP.TOKEN'].sort());
    expect(conflictingSidecars(['META-INF/other.txt'])).toEqual([]);
  });
});

describe('writeSidecars', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    ({ dir, file } = tmpArchive(buildZipwikiFixture()));
  });
  afterEach(() => rmTmp(dir));

  it('adds TS-SUBMIT and ZipReaderNode reads it back', async () => {
    const meta = { digest: 'cd'.repeat(32), status: 'pending', serverUrl: 'https://example.invalid' };
    await writeSidecars(file, { add: [buildSubmitSidecar(meta)] });

    expect(entryNames(file)).toContain(SUBMIT);
    expect(JSON.parse(readText(file, SUBMIT))).toEqual(meta);
  });

  it('leaves content members byte-identical (incl. 0x014F) and does not add 0x014E', async () => {
    const before = ZipReaderNode.open(file);
    const parsedBefore = before.getEntry('wiki/parsed/doc.txt.md')!;
    const extraBefore = Buffer.from(parsedBefore.centralExtra);
    const crcBefore = parsedBefore.crc32;
    before.close();

    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'ef'.repeat(32) })] });

    const after = ZipReaderNode.open(file);
    try {
      const parsed = after.getEntry('wiki/parsed/doc.txt.md')!;
      expect(parsed.crc32).toBe(crcBefore);
      expect(parsed.centralExtra.equals(extraBefore)).toBe(true);
      expect(getExtraField(parsed.centralExtra, HDR_ID.ORIGIN)).not.toBeNull();
      expect(getExtraField(parsed.centralExtra, HDR_ID.SHA256)).toBeNull();
      expect(after.readEntry('doc.txt').equals(DOC_TEXT)).toBe(true);
    } finally {
      after.close();
    }
  });

  it('TIMESTAMP replaces TS-SUBMIT, adds the timestamped profile', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'aa'.repeat(32) })] });
    await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'aa'.repeat(32), status: 'confirmed' })] });

    const names = entryNames(file);
    expect(names).toContain(TIMESTAMP);
    expect(names).not.toContain(SUBMIT);
    const manifest = await readManifest(file);
    expect(manifest.profiles).toEqual(expect.arrayContaining(['zipwiki', 'timestamped']));
  });

  it('TOKEN removes TS-SUBMIT, keeps TIMESTAMP, adds tokenized', async () => {
    await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'aa'.repeat(32) })] });
    await writeSidecars(file, { add: [buildTokenSidecar({ merkleRoot: 'aa'.repeat(32), tokenId: '1' })] });

    const names = entryNames(file);
    expect(names).toContain(TOKEN);
    expect(names).toContain(TIMESTAMP);
    expect(names).not.toContain(SUBMIT);
    const manifest = await readManifest(file);
    expect(manifest.profiles).toEqual(expect.arrayContaining(['zipwiki', 'timestamped', 'tokenized']));
  });

  it('TOKEN also supersedes a pending TS-SUBMIT', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'aa'.repeat(32) })] });
    await writeSidecars(file, { add: [buildTokenSidecar({ merkleRoot: 'aa'.repeat(32), tokenId: '1' })] });
    const names = entryNames(file);
    expect(names).toContain(TOKEN);
    expect(names).not.toContain(SUBMIT);
  });

  it('a fresh TS-SUBMIT drops TIMESTAMP/TOKEN and clears their profiles', async () => {
    await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'aa'.repeat(32) })] });
    await writeSidecars(file, { add: [buildTokenSidecar({ merkleRoot: 'aa'.repeat(32) })] });
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'bb'.repeat(32) })] });

    const names = entryNames(file);
    expect(names).toContain(SUBMIT);
    expect(names).not.toContain(TIMESTAMP);
    expect(names).not.toContain(TOKEN);
    const manifest = await readManifest(file);
    expect(manifest.profiles).toEqual(['zipwiki']);
  });

  it('honours updateProfiles: false and explicit remove', async () => {
    await writeSidecars(file, {
      add: [buildTimestampSidecar({ digest: 'aa'.repeat(32) })],
      updateProfiles: false,
    });
    expect((await readManifest(file)).profiles).toEqual(['zipwiki']);

    await writeSidecars(file, { remove: [TIMESTAMP], updateProfiles: false });
    expect(entryNames(file)).not.toContain(TIMESTAMP);
  });

  it('works on archives without a manifest and does not create one', async () => {
    rmTmp(dir);
    ({ dir, file } = tmpArchive(buildZipwikiFixture({ noManifest: true })));
    await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'aa'.repeat(32) })] });
    const names = entryNames(file);
    expect(names).toContain(TIMESTAMP);
    expect(names).not.toContain('META-INF/manifest.json');
  });

  it('is atomic: no temp files are left behind', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'aa'.repeat(32) })] });
    expect(fs.readdirSync(dir)).toEqual(['fixture.zipwiki']);
  });

  it('rejects non META-INF names', async () => {
    await expect(
      writeSidecars(file, { add: [{ name: 'evil.txt', bytes: Buffer.from('x') }] })
    ).rejects.toThrow(/META-INF/);
  });
});
