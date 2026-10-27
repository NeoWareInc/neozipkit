import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildZipBufferSync } from '../../../src/node/buildZipBuffer';
import { ZipReaderNode } from '../../../src/node/ZipReaderNode';
import { applyMetaSidecars, rewriteZip } from '../../../src/node/rewriteZip';
import { makeOriginExtra, parseOriginFromExtra } from '../../../src/core/origin/OriginExtra';
import { META_MANIFEST_JSON, META_TOKEN_NZIP } from '../../../src/core/constants/MetaPaths';
import { getExtraField } from '../../../src/core/extra';
import { HDR_ID } from '../../../src/core/constants/Headers';
import ZipkitNode from '../../../src/node/ZipkitNode';
import { updateManifest, readManifest } from '../../../src/node/manifest';
import { createManifest } from '../../../src/core/manifest';

const doc = Buffer.from('document body '.repeat(300));
const note = Buffer.from('note '.repeat(300));

describe('rewriteZip', () => {
  let dir: string;
  let src: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rwz-'));
    src = path.join(dir, 'src.zip');
    fs.writeFileSync(
      src,
      buildZipBufferSync([
        { name: 'doc.txt', data: doc, method: 8, useSHA256: true },
        {
          name: 'wiki/parsed/doc.pdf.md',
          data: Buffer.from('# parsed '.repeat(50)),
          method: 93,
          additionalExtra: makeOriginExtra({ uri: 'https://example.org/doc.pdf', size: 9 }),
          externalAttr: 0o100644 << 16,
        },
        { name: 'note.txt', data: note, method: 0 },
        { name: 'café.txt', data: Buffer.from('é'), method: 0, utf8Flag: true },
      ])
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const open = (p: string) => ZipReaderNode.open(p);

  test('keep is byte-identical: payload, crc, dos time, extras', async () => {
    const dest = path.join(dir, 'out.zip');
    await rewriteZip(src, dest, { drop: ['note.txt'] });
    const a = open(src);
    const b = open(dest);
    try {
      expect(b.entries().map((e) => e.name)).toEqual([
        'doc.txt',
        'wiki/parsed/doc.pdf.md',
        'café.txt',
      ]);
      for (const name of ['doc.txt', 'wiki/parsed/doc.pdf.md', 'café.txt']) {
        const ra = a.readRaw(name);
        const rb = b.readRaw(name);
        expect(rb.compressed.equals(ra.compressed)).toBe(true);
        expect(rb.crc32).toBe(ra.crc32);
        expect(rb.method).toBe(ra.method);
        const ea = a.getEntry(name)!;
        const eb = b.getEntry(name)!;
        expect([eb.dosTime, eb.dosDate]).toEqual([ea.dosTime, ea.dosDate]);
        expect(eb.externalAttr).toBe(ea.externalAttr);
        expect(b.readEntry(name).equals(a.readEntry(name))).toBe(true);
      }
      expect(getExtraField(b.readRaw('doc.txt').centralExtra, HDR_ID.SHA256)).not.toBeNull();
      expect(parseOriginFromExtra(b.readRaw('wiki/parsed/doc.pdf.md').centralExtra)?.uri).toBe(
        'https://example.org/doc.pdf'
      );
    } finally {
      a.close();
      b.close();
    }
  });

  test('replace in place, add at end, drop; src untouched', async () => {
    const dest = path.join(dir, 'out.zip');
    const before = fs.readFileSync(src);
    await rewriteZip(src, dest, {
      replace: [{ name: 'note.txt', data: Buffer.from('new note'), method: 0 }],
      add: [{ name: 'extra.txt', data: Buffer.from('extra') }],
      drop: ['doc.txt', 'does-not-exist.txt'],
    });
    expect(fs.readFileSync(src).equals(before)).toBe(true);
    const r = open(dest);
    try {
      expect(r.entries().map((e) => e.name)).toEqual([
        'wiki/parsed/doc.pdf.md',
        'note.txt',
        'café.txt',
        'extra.txt',
      ]);
      expect(r.readEntry('note.txt').toString()).toBe('new note');
      expect(r.readEntry('extra.txt').toString()).toBe('extra');
      expect(r.readEntry('café.txt').toString()).toBe('é');
    } finally {
      r.close();
    }
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp.'))).toEqual([]);
  });

  test('replace keeps 0x014E when the old entry had it', async () => {
    const dest = path.join(dir, 'out.zip');
    await rewriteZip(src, dest, { replace: [{ name: 'doc.txt', data: Buffer.from('v2') }] });
    const r = open(dest);
    try {
      expect(getExtraField(r.getEntry('doc.txt')!.centralExtra, HDR_ID.SHA256)).not.toBeNull();
      expect(r.readEntry('doc.txt').toString()).toBe('v2');
    } finally {
      r.close();
    }
  });

  test('members form, order, and errors', async () => {
    const dest = path.join(dir, 'out.zip');
    await rewriteZip(src, dest, {
      members: [
        { action: 'drop', name: 'doc.txt' },
        { action: 'add', name: 'z.txt', data: Buffer.from('z') },
        { action: 'keep', name: 'note.txt' },
      ],
      order: ['z.txt', 'note.txt'],
    });
    const r = open(dest);
    expect(r.entries().map((e) => e.name)).toEqual([
      'z.txt',
      'note.txt',
      'wiki/parsed/doc.pdf.md',
      'café.txt',
    ]);
    r.close();

    await expect(rewriteZip(src, dest, { add: [{ name: 'doc.txt', data: doc }] })).rejects.toThrow(
      /already exists/
    );
    await expect(rewriteZip(src, dest, { replace: [{ name: 'nope', data: doc }] })).rejects.toThrow(
      /not found/
    );
    await expect(rewriteZip(src, dest, { order: ['nope'] })).rejects.toThrow(/unknown entry/);
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp.'))).toEqual([]);
  });

  test('in-place rewrite (dest === src)', async () => {
    await rewriteZip(src, src, { drop: ['note.txt'] });
    const r = open(src);
    expect(r.entries().length).toBe(3);
    r.close();
  });

  test('applyMetaSidecars adds, replaces and removes without touching content', async () => {
    const original = open(src);
    const rawDoc = original.readRaw('doc.txt').compressed;
    original.close();

    await applyMetaSidecars(src, {
      add: [
        { name: 'meta-inf/token.nzip', bytes: Buffer.from('token-1') },
        { name: META_MANIFEST_JSON, bytes: Buffer.from('{}') },
      ],
    });
    let r = open(src);
    expect(r.entries().map((e) => e.name).slice(-2)).toEqual([META_TOKEN_NZIP, META_MANIFEST_JSON]);
    expect(r.readEntry(META_TOKEN_NZIP).toString()).toBe('token-1');
    expect(r.readRaw('doc.txt').compressed.equals(rawDoc)).toBe(true);
    r.close();

    await applyMetaSidecars(src, {
      add: [{ name: META_TOKEN_NZIP, bytes: Buffer.from('token-2') }],
      remove: [META_MANIFEST_JSON, 'META-INF/missing.txt'],
    });
    r = open(src);
    expect(r.entries().filter((e) => e.name.startsWith('META-INF/')).map((e) => e.name)).toEqual([
      META_TOKEN_NZIP,
    ]);
    expect(r.readEntry(META_TOKEN_NZIP).toString()).toBe('token-2');
    r.close();

    await expect(
      applyMetaSidecars(src, { add: [{ name: 'doc.txt', bytes: Buffer.from('x') }] })
    ).rejects.toThrow(/META-INF/);
  });

  test('applyMetaSidecars inPlace:false writes destPath and leaves the source', async () => {
    const before = fs.readFileSync(src);
    const dest = path.join(dir, 'copy.zip');
    await expect(
      applyMetaSidecars(src, { inPlace: false, add: [{ name: META_TOKEN_NZIP, bytes: Buffer.from('t') }] })
    ).rejects.toThrow(/destPath/);
    await applyMetaSidecars(src, {
      inPlace: false,
      destPath: dest,
      add: [{ name: META_TOKEN_NZIP, bytes: Buffer.from('t') }],
    });
    expect(fs.readFileSync(src).equals(before)).toBe(true);
    const r = open(dest);
    expect(r.getEntry(META_TOKEN_NZIP)).not.toBeNull();
    r.close();
  });

  test('ZipkitNode.updateZipFile maps onto rewriteZip', async () => {
    const add = path.join(dir, 'added.txt');
    fs.writeFileSync(add, 'added file');
    const upd = path.join(dir, 'upd.txt');
    fs.writeFileSync(upd, 'updated file');
    await new ZipkitNode().updateZipFile(src, {
      add: [{ filePath: add }],
      update: [{ entryName: 'note.txt', filePath: upd, options: { level: 0 } }],
      remove: ['doc.txt'],
    });
    const r = open(src);
    expect(r.entries().map((e) => e.name)).toEqual([
      'wiki/parsed/doc.pdf.md',
      'note.txt',
      'café.txt',
      'added.txt',
    ]);
    expect(r.readEntry('note.txt').toString()).toBe('updated file');
    expect(r.getEntry('note.txt')!.method).toBe(0);
    r.close();
  });

  test('updateManifest adds then replaces only the manifest entry', async () => {
    const original = open(src);
    const rawNote = original.readRaw('note.txt').compressed;
    original.close();

    const first = await updateManifest(src, (m) => ({ ...m, profiles: ['integrity'] }));
    expect(first.format).toBe('neozip');
    expect((await readManifest(src)).profiles).toEqual(['integrity']);

    const created = createManifest({ specVersion: '0.3.0', createdAt: first.createdAt });
    expect(created.createdAt).toBe(first.createdAt);

    await updateManifest(src, (m) => ({ ...m, ai: { root: 'wiki' } }));
    const m = await readManifest(src);
    expect(m.ai).toEqual({ root: 'wiki' });
    expect(m.profiles).toEqual(['integrity']);

    const r = open(src);
    expect(r.entries().filter((e) => e.name === META_MANIFEST_JSON).length).toBe(1);
    expect(r.getEntry(META_MANIFEST_JSON)!.method).toBe(0);
    expect(r.readRaw('note.txt').compressed.equals(rawNote)).toBe(true);
    r.close();

    await expect(
      updateManifest(src, (x) => ({ ...x, format: 'other' as unknown as 'neozip' }))
    ).rejects.toThrow(/invalid manifest/);
  });

  test('readManifest rejects case-variant duplicates and missing manifest', async () => {
    const dup = path.join(dir, 'dup.zip');
    fs.writeFileSync(
      dup,
      buildZipBufferSync([
        { name: 'META-INF/manifest.json', data: Buffer.from('{}'), method: 0 },
        { name: 'meta-inf/MANIFEST.JSON', data: Buffer.from('{}'), method: 0 },
      ])
    );
    await expect(readManifest(dup)).rejects.toThrow(/both/);
    await expect(readManifest(src)).rejects.toThrow(/not found/);
  });
});
