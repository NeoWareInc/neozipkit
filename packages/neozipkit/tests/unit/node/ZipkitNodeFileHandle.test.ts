/**
 * Ensures ZipkitNode closes fs.promises read handles when replacing state (loadZipFile reuse,
 * closeFile, failed load) so callers do not rely on GC (Node DEP0137).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ZipkitNode from '../../../src/node/ZipkitNode';

describe('ZipkitNode file handles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipkit-fh-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('closes the previous read handle when loadZipFile is called again on the same instance', async () => {
    const a = path.join(tmpDir, 'a.txt');
    const b = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(a, 'aaa');
    fs.writeFileSync(b, 'bbbb');

    const zipA = path.join(tmpDir, 'first.zip');
    const zipB = path.join(tmpDir, 'second.zip');

    const w1 = new ZipkitNode();
    const w2 = new ZipkitNode();
    await w1.createZipFromFiles([a], zipA);
    await w2.createZipFromFiles([b], zipB);

    const reader = new ZipkitNode();
    await reader.loadZipFile(zipA);
    expect(reader.getDirectory().map((e) => e.filename)).toContain('a.txt');

    await reader.loadZipFile(zipB);
    expect(reader.getDirectory().map((e) => e.filename)).toContain('b.txt');
    expect(reader.getDirectory().map((e) => e.filename)).not.toContain('a.txt');

    await reader.closeFile();
  });

  it('clears read state when loadZipFile fails (e.g. missing file)', async () => {
    const badPath = path.join(tmpDir, 'missing.zip');
    const zip = new ZipkitNode();
    await expect(zip.loadZipFile(badPath)).rejects.toThrow();
    expect((zip as any).filePath).toBeNull();
    expect((zip as any).fileHandle).toBeNull();
  });
});
