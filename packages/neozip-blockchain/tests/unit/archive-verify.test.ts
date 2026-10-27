/**
 * verifyArchive: sidecar kinds, Merkle binding, offline vs online, tampering.
 * The Token Service is mocked; nothing here touches the network.
 */

import * as fs from 'fs';
import { ZipReaderNode, getExtraField, HDR_ID } from 'neozipkit/node';

jest.mock('../../src/token-service/TokenServiceHelpers', () => ({
  ...jest.requireActual('../../src/token-service/TokenServiceHelpers'),
  verifyDigest: jest.fn(),
}));

import { verifyDigest } from '../../src/token-service/TokenServiceHelpers';
import { verifyArchive } from '../../src/archive';
import {
  buildSubmitSidecar,
  buildTimestampSidecar,
  buildTokenSidecar,
  writeSidecars,
} from '../../src/sidecars';
import {
  buildZipwikiFixture,
  tmpArchive,
  rmTmp,
  rootOf,
  makeBatchProof,
  DOC_TEXT,
} from '../helpers/zipwikiFixture';

const verifyDigestMock = verifyDigest as jest.MockedFunction<typeof verifyDigest>;

describe('verifyArchive', () => {
  let dir: string;
  let file: string;
  let root: string;

  beforeEach(async () => {
    verifyDigestMock.mockReset();
    ({ dir, file } = tmpArchive(buildZipwikiFixture()));
    root = await rootOf(file);
  });
  afterEach(() => rmTmp(dir));

  it('fixture is ZipWiki-shaped: zstd content, manifest first, 0x014F on the parse, no 0x014E', () => {
    const reader = ZipReaderNode.open(file);
    try {
      const entries = reader.entries();
      expect(entries[0].name).toBe('META-INF/manifest.json');
      expect(reader.getEntry('doc.txt')!.method).toBe(93);
      expect(reader.getEntry('wiki/parsed/doc.txt.md')!.method).toBe(93);
      for (const e of entries) {
        expect(getExtraField(e.centralExtra, HDR_ID.SHA256)).toBeNull();
      }
      expect(getExtraField(reader.getEntry('wiki/parsed/doc.txt.md')!.centralExtra, HDR_ID.ORIGIN)).not.toBeNull();
    } finally {
      reader.close();
    }
  });

  it('kind none on an unstamped fixture', async () => {
    const res = await verifyArchive(file);
    expect(res.kind).toBe('none');
    expect(res.status).toBe('none');
    expect(res.merkle.match).toBe(false);
    expect(res.merkle.root).toBe(root);
  });

  it('submit sidecar offline: merkle matches (v1/high), online is skipped', async () => {
    await writeSidecars(file, {
      add: [buildSubmitSidecar({ digest: root, status: 'pending', serverUrl: 'https://ts.invalid', chainId: 84532 })],
    });
    const res = await verifyArchive(file);
    expect(res.kind).toBe('submit');
    expect(res.merkle).toMatchObject({ match: true, algorithm: 'v1', security: 'high', root });
    expect(res.status).toBe('pending');
    expect(res.details).toMatchObject({ online: 'skipped' });
    expect(verifyDigestMock).not.toHaveBeenCalled();
  });

  it('submit sidecar online: server confirmation makes it upgradable', async () => {
    await writeSidecars(file, {
      add: [buildSubmitSidecar({ digest: root, serverUrl: 'https://ts.invalid', chainId: 84532, batchId: 'b1' })],
    });
    verifyDigestMock.mockResolvedValue({ success: true, verified: true, digest: root });
    const res = await verifyArchive(file, { online: true });
    expect(res.status).toBe('upgradable');
    expect(verifyDigestMock).toHaveBeenCalledWith(
      root,
      84532,
      'b1',
      undefined,
      expect.objectContaining({ serverUrl: 'https://ts.invalid' })
    );
  });

  it('submit sidecar online: unreachable server degrades to pending', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: root })] });
    verifyDigestMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await verifyArchive(file, { online: true });
    expect(res.status).toBe('pending');
    expect(res.details).toMatchObject({ onlineError: 'ECONNREFUSED' });
  });

  it('timestamp sidecar: valid embedded proof verifies offline', async () => {
    const { batchMerkleRoot, merkleProof } = makeBatchProof(root);
    await writeSidecars(file, {
      add: [buildTimestampSidecar({ digest: root, status: 'confirmed', merkleRoot: batchMerkleRoot, merkleProof })],
    });
    const res = await verifyArchive(file);
    expect(res.kind).toBe('timestamp');
    expect(res.merkle.match).toBe(true);
    expect(res.status).toBe('confirmed-offline');
  });

  it('timestamp sidecar: bad or missing proof is flagged', async () => {
    const { batchMerkleRoot } = makeBatchProof(root);
    await writeSidecars(file, {
      add: [buildTimestampSidecar({ digest: root, merkleRoot: batchMerkleRoot, merkleProof: ['0x' + '11'.repeat(32)] })],
    });
    expect((await verifyArchive(file)).status).toBe('invalid-proof');

    await writeSidecars(file, { add: [buildTimestampSidecar({ digest: root })] });
    expect((await verifyArchive(file)).status).toBe('incomplete-proof');
  });

  it('token sidecar offline: bound to content, chain not checked; token outranks timestamp', async () => {
    const { batchMerkleRoot, merkleProof } = makeBatchProof(root);
    await writeSidecars(file, {
      add: [buildTimestampSidecar({ digest: root, merkleRoot: batchMerkleRoot, merkleProof })],
    });
    await writeSidecars(file, {
      add: [
        buildTokenSidecar({
          tokenId: '1',
          merkleRoot: root,
          timestampProof: { digest: root, batchMerkleRoot, merkleProof },
        }),
      ],
    });
    const res = await verifyArchive(file);
    expect(res.kind).toBe('token');
    expect(res.merkle.match).toBe(true);
    expect(res.status).toBe('token-unverified');
    expect(res.details).toMatchObject({ timestampProofValid: true });
  });

  it('precomputed merkleRoot is trusted and skips reading content', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: root })] });
    const ok = await verifyArchive(file, { merkleRoot: root });
    expect(ok.merkle).toMatchObject({ match: true, root });
    expect(ok.merkle.algorithm).toBeUndefined();

    const bad = await verifyArchive(file, { merkleRoot: 'ab'.repeat(32) });
    expect(bad.merkle.match).toBe(false);
    expect(bad.status).toBe('merkle-mismatch');
    await expect(verifyArchive(file, { merkleRoot: 'nope' })).rejects.toThrow(/64-character hex/);
  });

  it('accepts an open ZipReaderNode and leaves it open', async () => {
    await writeSidecars(file, { add: [buildSubmitSidecar({ digest: root })] });
    const reader = ZipReaderNode.open(file);
    try {
      const res = await verifyArchive(reader);
      expect(res.merkle.match).toBe(true);
      // Still usable.
      expect(reader.readEntry('doc.txt').equals(DOC_TEXT)).toBe(true);
    } finally {
      reader.close();
    }
  });

  describe('tampering', () => {
    it('different content under a copied sidecar: merkle-mismatch', async () => {
      await writeSidecars(file, { add: [buildSubmitSidecar({ digest: root })] });
      const sidecarBytes = (() => {
        const r = ZipReaderNode.open(file);
        try {
          return r.readEntry('META-INF/TS-SUBMIT.NZIP');
        } finally {
          r.close();
        }
      })();

      // Same layout, edited document, then the old proof is pasted in.
      const other = tmpArchive(buildZipwikiFixture({ docText: Buffer.from('edited document\n'.repeat(300)) }), 'other.zipwiki');
      try {
        await writeSidecars(other.file, { add: [{ name: 'META-INF/TS-SUBMIT.NZIP', bytes: sidecarBytes }] });
        const res = await verifyArchive(other.file);
        expect(res.kind).toBe('submit');
        expect(res.merkle.match).toBe(false);
        expect(res.merkle.root).not.toBe(root);
        expect(res.status).toBe('merkle-mismatch');
      } finally {
        rmTmp(other.dir);
      }
    });

    it.each([
      ['stored', true],
      ['zstd', false],
    ])('flipped payload byte (%s): match is false, never throws', async (_label, stored) => {
      rmTmp(dir);
      const built = tmpArchive(buildZipwikiFixture({ stored }));
      dir = built.dir;
      file = built.file;
      const goodRoot = await rootOf(file);
      await writeSidecars(file, { add: [buildSubmitSidecar({ digest: goodRoot })] });
      expect((await verifyArchive(file)).merkle.match).toBe(true);

      // Locate doc.txt's payload and flip a byte in it.
      const reader = ZipReaderNode.open(file);
      const entry = reader.getEntry('doc.txt')!;
      reader.close();
      const buf = fs.readFileSync(file);
      const off = entry.localHeaderOffset;
      const dataStart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      buf[dataStart + 4] ^= 0xff;
      fs.writeFileSync(file, buf);

      const res = await verifyArchive(file);
      expect(res.kind).toBe('submit');
      expect(res.merkle.match).toBe(false);
      expect(['integrity-error', 'merkle-mismatch']).toContain(res.status);
    });
  });
});
