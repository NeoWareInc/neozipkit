/**
 * stampArchive / upgradeTimestamp / mintTimestampProof / mintDirect orchestration.
 * Token Service helpers, ZipkitMinter and ethers are mocked; no network.
 */

import { ZipReaderNode, applyMetaSidecars, readManifest } from 'neozipkit/node';

jest.mock('../../src/token-service/TokenServiceHelpers', () => ({
  ...jest.requireActual('../../src/token-service/TokenServiceHelpers'),
  submitDigest: jest.fn(),
  verifyDigest: jest.fn(),
  pollForConfirmation: jest.fn(),
  prepareMint: jest.fn(),
  checkNFTStatus: jest.fn(),
}));

const mockMintWithTimestampProof = jest.fn();
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  class FakeProvider {
    getBalance = jest.fn().mockResolvedValue(10n ** 18n);
    destroy = jest.fn();
  }
  class FakeWallet {
    address = '0x00000000000000000000000000000000000000AA';
  }
  class FakeContract {
    interface = {
      parseLog: () => ({ name: 'TimestampProofMinted', args: { tokenId: 42n } }),
    };
    mintWithTimestampProof = mockMintWithTimestampProof;
  }
  return {
    ...actual,
    ethers: { ...actual.ethers, JsonRpcProvider: FakeProvider, Wallet: FakeWallet, Contract: FakeContract },
  };
});

const mockMinterCtor = jest.fn();
const mockCompleteMinting = jest.fn();
const mockDestroy = jest.fn();
jest.mock('../../src/core/ZipkitMinter', () => ({
  ...jest.requireActual('../../src/core/ZipkitMinter'),
  ZipkitMinter: class {
    constructor(...args: unknown[]) {
      mockMinterCtor(...args);
    }
    completeMinting = mockCompleteMinting;
    destroy = mockDestroy;
  },
}));

import {
  submitDigest,
  verifyDigest,
  pollForConfirmation,
  prepareMint,
  checkNFTStatus,
} from '../../src/token-service/TokenServiceHelpers';
import {
  stampArchive,
  upgradeTimestamp,
  mintTimestampProof,
  mintDirect,
  verifyArchive,
} from '../../src/archive';
import { buildSubmitSidecar, buildTimestampSidecar, writeSidecars } from '../../src/sidecars';
import {
  buildZipwikiFixture,
  tmpArchive,
  rmTmp,
  rootOf,
  entryNames,
  readText,
  makeBatchProof,
} from '../helpers/zipwikiFixture';

const m = {
  submitDigest: submitDigest as jest.Mock,
  verifyDigest: verifyDigest as jest.Mock,
  pollForConfirmation: pollForConfirmation as jest.Mock,
  prepareMint: prepareMint as jest.Mock,
  checkNFTStatus: checkNFTStatus as jest.Mock,
};

const SUBMIT = 'META-INF/TS-SUBMIT.NZIP';
const TIMESTAMP = 'META-INF/TIMESTAMP.NZIP';
const TOKEN = 'META-INF/TOKEN.NZIP';
const SERVER = 'https://ts.invalid';

describe('archive flows', () => {
  let dir: string;
  let file: string;
  let root: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(m).forEach((fn) => fn.mockReset());
    ({ dir, file } = tmpArchive(buildZipwikiFixture()));
    root = await rootOf(file);
  });
  afterEach(() => rmTmp(dir));

  describe('stampArchive', () => {
    const ok = (digest: string) => ({
      success: true,
      digest,
      batchId: 'batch-1',
      batchNumber: 3,
      chainId: 84532,
      network: 'Base Sepolia',
      status: 'pending',
    });

    it('computes the root, submits, and writes TS-SUBMIT', async () => {
      m.submitDigest.mockImplementation(async (d: string) => ok(d));
      const res = await stampArchive(file, { email: 'a@b.co', network: 'base-sepolia', serverUrl: SERVER });

      expect(res.merkleRoot).toBe(root);
      expect(m.submitDigest).toHaveBeenCalledWith(
        root,
        'a@b.co',
        84532,
        expect.objectContaining({ serverUrl: SERVER, network: 'base-sepolia' })
      );
      expect(res.sidecar.name).toBe(SUBMIT);
      expect(res.written).toBe(true);
      expect(entryNames(file)).toContain(SUBMIT);
      expect(JSON.parse(readText(file, SUBMIT))).toMatchObject({
        digest: root,
        batchId: 'batch-1',
        status: 'pending',
        serverUrl: SERVER,
      });
      // And the result verifies as a bound, pending proof.
      const v = await verifyArchive(file);
      expect(v).toMatchObject({ kind: 'submit', status: 'pending', merkle: { match: true } });
    });

    it('uses a precomputed merkleRoot without reading content', async () => {
      const given = 'ab'.repeat(32);
      m.submitDigest.mockImplementation(async (d: string) => ok(d));
      const res = await stampArchive(file, { email: 'a@b.co', merkleRoot: given.toUpperCase(), serverUrl: SERVER });
      expect(res.merkleRoot).toBe(given);
      expect(m.submitDigest.mock.calls[0][0]).toBe(given);
    });

    it('write: false returns the sidecar and leaves the archive untouched', async () => {
      m.submitDigest.mockImplementation(async (d: string) => ok(d));
      const res = await stampArchive(file, { email: 'a@b.co', write: false, serverUrl: SERVER });
      expect(res.written).toBe(false);
      expect(res.sidecar.bytes.length).toBeGreaterThan(0);
      expect(entryNames(file)).not.toContain(SUBMIT);
    });

    it('surfaces server rejection and does not modify the archive', async () => {
      m.submitDigest.mockResolvedValue({ success: false, digest: root, status: 'pending', error: 'email not verified' });
      await expect(stampArchive(file, { email: 'a@b.co', serverUrl: SERVER })).rejects.toThrow('email not verified');
      expect(entryNames(file)).not.toContain(SUBMIT);
    });

    it('refuses to drop a proof bound to the same root unless forced; replaces stale proofs', async () => {
      m.submitDigest.mockImplementation(async (d: string) => ok(d));
      await writeSidecars(file, { add: [buildTimestampSidecar({ digest: root })] });
      await expect(stampArchive(file, { email: 'a@b.co', serverUrl: SERVER })).rejects.toThrow(/force/);
      expect(entryNames(file)).toContain(TIMESTAMP);

      await stampArchive(file, { email: 'a@b.co', serverUrl: SERVER, force: true });
      expect(entryNames(file)).toContain(SUBMIT);
      expect(entryNames(file)).not.toContain(TIMESTAMP);

      // Stale (different root) TIMESTAMP: replaced without force (§8.6).
      await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'cd'.repeat(32) })] });
      await stampArchive(file, { email: 'a@b.co', serverUrl: SERVER });
      expect(entryNames(file)).not.toContain(TIMESTAMP);
    });

    it('requires an email', async () => {
      await expect(stampArchive(file, {} as never)).rejects.toThrow(/email/);
    });
  });

  describe('upgradeTimestamp', () => {
    const confirmed = () => {
      const { batchMerkleRoot, merkleProof } = makeBatchProof(root);
      return {
        success: true,
        verified: true,
        digest: root,
        merkleRoot: batchMerkleRoot,
        merkleProof,
        transactionHash: '0xtx',
        blockNumber: 99,
        timestamp: 1700000000,
      };
    };

    beforeEach(async () => {
      await writeSidecars(file, {
        add: [buildSubmitSidecar({ digest: root, serverUrl: SERVER, chainId: 84532, batchId: 'batch-1', status: 'pending' })],
      });
    });

    it('swaps TS-SUBMIT for TIMESTAMP when confirmed, and the result verifies offline', async () => {
      m.verifyDigest.mockResolvedValue(confirmed());
      const res = await upgradeTimestamp(file);

      expect(res.status).toBe('confirmed');
      expect(m.verifyDigest).toHaveBeenCalledWith(root, 84532, 'batch-1', undefined, expect.objectContaining({ serverUrl: SERVER }));
      const names = entryNames(file);
      expect(names).toContain(TIMESTAMP);
      expect(names).not.toContain(SUBMIT);
      expect(JSON.parse(readText(file, TIMESTAMP))).toMatchObject({
        status: 'confirmed',
        transactionHash: '0xtx',
        blockNumber: 99,
        digest: root,
      });
      expect((await readManifest(file)).profiles).toContain('timestamped');
      expect((await verifyArchive(file)).status).toBe('confirmed-offline');
    });

    it('wait: polls with the given timeout', async () => {
      m.pollForConfirmation.mockResolvedValue(confirmed());
      const res = await upgradeTimestamp(file, { wait: true, timeoutMs: 1234, pollIntervalMs: 10 });
      expect(res.status).toBe('confirmed');
      expect(m.pollForConfirmation).toHaveBeenCalledWith(root, 84532, 'batch-1', 1234, 10, expect.any(Object));
      expect(m.verifyDigest).not.toHaveBeenCalled();
    });

    it('stays pending when the batch is not confirmed', async () => {
      m.verifyDigest.mockResolvedValue({ success: true, verified: false, digest: root, status: 'pending' });
      const res = await upgradeTimestamp(file);
      expect(res.status).toBe('pending');
      expect(entryNames(file)).toContain(SUBMIT);
      expect(entryNames(file)).not.toContain(TIMESTAMP);
    });

    it('rejects a submit that no longer matches the content', async () => {
      await writeSidecars(file, { add: [buildSubmitSidecar({ digest: 'ef'.repeat(32), serverUrl: SERVER })] });
      await expect(upgradeTimestamp(file)).rejects.toThrow(/does not match/);
      expect(m.verifyDigest).not.toHaveBeenCalled();
    });

    it('reports none / already-confirmed', async () => {
      const plain = tmpArchive(buildZipwikiFixture(), 'plain.zipwiki');
      try {
        expect((await upgradeTimestamp(plain.file)).status).toBe('none');
        await writeSidecars(plain.file, { add: [buildTimestampSidecar({ digest: root })] });
        expect((await upgradeTimestamp(plain.file)).status).toBe('already-confirmed');
      } finally {
        rmTmp(plain.dir);
      }
    });
  });

  describe('mintTimestampProof', () => {
    const mintData = () => {
      const { batchMerkleRoot, merkleProof } = makeBatchProof(root);
      return {
        digest: root,
        merkleProof,
        batchMerkleRoot,
        nftContractAddress: '0x00000000000000000000000000000000000000BB',
        registryAddress: '0x00000000000000000000000000000000000000CC',
        mintFee: '0.001',
        mintFeeWei: '1000000000000000',
        chainId: 84532,
        network: 'base-sepolia',
        contractVersion: '2.51',
        batchId: 'batch-1',
        batchNumber: 3,
        batchTransactionHash: '0xbatch',
        batchBlockNumber: 90,
        batchTimestamp: 1700000000,
      };
    };

    async function archiveWithSubmitAndTimestamp() {
      const { batchMerkleRoot, merkleProof } = makeBatchProof(root);
      // Both present at once (e.g. produced by an older tool); writeSidecars would drop one.
      await applyMetaSidecars(file, {
        add: [
          buildSubmitSidecar({ digest: root }),
          buildTimestampSidecar({
            digest: root,
            status: 'confirmed',
            chainId: 84532,
            batchId: 'batch-1',
            serverUrl: SERVER,
            merkleRoot: batchMerkleRoot,
            merkleProof,
          }),
        ],
      });
    }

    const key = '0x' + '11'.repeat(32);

    it('requires TIMESTAMP.NZIP', async () => {
      await expect(mintTimestampProof(file, { walletPrivateKey: key })).rejects.toThrow(/TIMESTAMP\.NZIP/);
    });

    it('mints, writes TOKEN, removes TS-SUBMIT, keeps TIMESTAMP, sets tokenized', async () => {
      await archiveWithSubmitAndTimestamp();
      m.checkNFTStatus.mockResolvedValue({ success: true, isMinted: false });
      m.prepareMint.mockResolvedValue({ success: true, mintData: mintData() });
      mockMintWithTimestampProof.mockResolvedValue({
        wait: async () => ({ status: 1, hash: '0xmint', blockNumber: 123, logs: [{ topics: [], data: '0x' }] }),
      });

      const res = await mintTimestampProof(file, { walletPrivateKey: key, accessToken: 'tok' });

      expect(res).toMatchObject({ tokenId: '42', transactionHash: '0xmint', blockNumber: 123, alreadyMinted: false });
      expect(mockMintWithTimestampProof).toHaveBeenCalledWith(
        root,
        expect.any(Array),
        expect.any(String),
        { value: 1000000000000000n }
      );
      expect(m.prepareMint).toHaveBeenCalledWith(root, 84532, 'batch-1', expect.objectContaining({ accessToken: 'tok' }));

      const names = entryNames(file);
      expect(names).toContain(TOKEN);
      expect(names).toContain(TIMESTAMP);
      expect(names).not.toContain(SUBMIT);
      expect(JSON.parse(readText(file, TOKEN))).toMatchObject({
        tokenId: '42',
        merkleRoot: root,
        networkChainId: 84532,
        timestampProof: { digest: root, batchNumber: 3 },
      });
      expect((await readManifest(file)).profiles).toContain('tokenized');
      expect(await verifyArchive(file)).toMatchObject({ kind: 'token', status: 'token-unverified', merkle: { match: true } });
    });

    it('reuses an existing token instead of sending a transaction', async () => {
      await archiveWithSubmitAndTimestamp();
      m.checkNFTStatus.mockResolvedValue({ success: true, isMinted: true, tokenId: '7', owner: '0xOwner' });
      m.prepareMint.mockResolvedValue({ success: true, mintData: mintData() });

      const res = await mintTimestampProof(file, { walletPrivateKey: key });
      expect(res).toMatchObject({ tokenId: '7', alreadyMinted: true, owner: '0xOwner' });
      expect(mockMintWithTimestampProof).not.toHaveBeenCalled();
      expect(entryNames(file)).toContain(TOKEN);
    });

    it('does not touch the archive when prepare-mint fails', async () => {
      await archiveWithSubmitAndTimestamp();
      m.checkNFTStatus.mockResolvedValue({ success: true, isMinted: false });
      m.prepareMint.mockResolvedValue({ success: false, error: 'membership required' });
      await expect(mintTimestampProof(file, { walletPrivateKey: key })).rejects.toThrow('membership required');
      expect(entryNames(file)).not.toContain(TOKEN);
    });

    it('rejects a timestamp that no longer matches the content', async () => {
      await writeSidecars(file, { add: [buildTimestampSidecar({ digest: 'ef'.repeat(32), chainId: 84532 })] });
      await expect(mintTimestampProof(file, { walletPrivateKey: key })).rejects.toThrow(/does not match/);
    });
  });

  describe('mintDirect', () => {
    const key = '0x' + '22'.repeat(32);
    const tokenMetadata = () => ({
      tokenId: '9',
      network: 'Base Sepolia',
      networkChainId: 84532,
      contractAddress: '0x00000000000000000000000000000000000000DD',
      merkleRoot: root,
      transactionHash: '0xdirect',
      blockNumber: 5,
      contractVersion: '2.51',
    });

    it('mints via ZipkitMinter and writes TOKEN.NZIP (TS-SUBMIT dropped)', async () => {
      await writeSidecars(file, { add: [buildSubmitSidecar({ digest: root })] });
      mockCompleteMinting.mockResolvedValue({
        mintingResult: { success: true, message: 'ok', tokenId: '9', transactionHash: '0xdirect' },
        tokenMetadata: tokenMetadata(),
      });

      const res = await mintDirect(file, { walletPrivateKey: key, network: 'base-sepolia', rpcUrlIndex: 1 });

      expect(mockMinterCtor).toHaveBeenCalledWith(
        root,
        expect.objectContaining({ walletPrivateKey: key, network: 'base-sepolia', rpcUrlIndex: 1 })
      );
      expect(mockDestroy).toHaveBeenCalled();
      expect(res.merkleRoot).toBe(root);
      const names = entryNames(file);
      expect(names).toContain(TOKEN);
      expect(names).not.toContain(SUBMIT);
      expect(JSON.parse(readText(file, TOKEN))).toMatchObject({ tokenId: '9', merkleRoot: root });
      expect(await verifyArchive(file)).toMatchObject({ kind: 'token', merkle: { match: true } });
    });

    it('honours a precomputed merkleRoot and write: false', async () => {
      const given = 'ab'.repeat(32);
      mockCompleteMinting.mockResolvedValue({
        mintingResult: { success: true, message: 'ok' },
        tokenMetadata: { ...tokenMetadata(), merkleRoot: given },
      });
      const res = await mintDirect(file, { walletPrivateKey: key, network: 'base-sepolia', merkleRoot: given, write: false });
      expect(mockMinterCtor.mock.calls[0][0]).toBe(given);
      expect(res.written).toBe(false);
      expect(entryNames(file)).not.toContain(TOKEN);
    });

    it('throws on a failed mint, still destroys the provider, and leaves the archive alone', async () => {
      mockCompleteMinting.mockResolvedValue({ mintingResult: { success: false, message: 'insufficient funds' } });
      await expect(mintDirect(file, { walletPrivateKey: key, network: 'base-sepolia' })).rejects.toThrow('insufficient funds');
      expect(mockDestroy).toHaveBeenCalled();
      expect(entryNames(file)).not.toContain(TOKEN);
    });
  });

  it('flows keep content members readable (ZipReaderNode integrity) after sidecar rewrites', async () => {
    m.submitDigest.mockImplementation(async (d: string) => ({ success: true, digest: d, status: 'pending', chainId: 84532, network: 'Base Sepolia' }));
    await stampArchive(file, { email: 'a@b.co', serverUrl: SERVER });
    const reader = ZipReaderNode.open(file);
    try {
      for (const e of reader.entries()) expect(() => reader.readEntry(e)).not.toThrow();
    } finally {
      reader.close();
    }
  });
});
