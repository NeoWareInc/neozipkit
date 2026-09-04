import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { secp256k1 } from '@noble/curves/secp256k1';
import { encryptForRecipients, decryptAsRecipient } from '../../../src/encryption/RecipientEncryption';
import { ACCESS_NZIP_PATH } from '../../../src/encryption/AccessMetadata';
import type { ResolvedIdentity } from '../../../src/identity/types';

// Skip this suite if neozipkit/node is not available (build not present)
let ZipkitNode: any;
try {
  ZipkitNode = require('neozipkit/node').default;
} catch {
  ZipkitNode = null;
}

const describeIfZipkit = ZipkitNode ? describe : describe.skip;

function generateKeyPair() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, false);
  return {
    privHex: Buffer.from(priv).toString('hex'),
    pubHex: Buffer.from(pub).toString('hex'),
  };
}

describeIfZipkit('RecipientEncryption (integration)', () => {
  let tmpDir: string;
  let testFile: string;
  let outputNzip: string;

  const alice = generateKeyPair();
  const bob = generateKeyPair();

  const aliceIdentity: ResolvedIdentity = {
    identity: 'alice.eth',
    identityType: 'ens',
    address: '0x' + 'AA'.repeat(20),
    publicKeyHex: alice.pubHex,
  };

  /** Same keys as alice, but `address` identity for multi-recipient (homogeneous types). */
  const aliceAddressIdentity: ResolvedIdentity = {
    identity: '0x' + 'AA'.repeat(20),
    identityType: 'address',
    address: '0x' + 'AA'.repeat(20),
    publicKeyHex: alice.pubHex,
  };

  const bobIdentity: ResolvedIdentity = {
    identity: '0x' + 'BB'.repeat(20),
    identityType: 'address',
    address: '0x' + 'BB'.repeat(20),
    publicKeyHex: bob.pubHex,
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nzp-test-'));
    testFile = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(testFile, 'Hello, identity-based encryption!');
    outputNzip = path.join(tmpDir, 'test.nzip');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('encrypts for a single recipient and decrypts successfully', async () => {
    const zip = new ZipkitNode();

    await encryptForRecipients(zip, [testFile], outputNzip, [aliceIdentity]);

    // Verify the archive exists and has ACCESS.NZIP
    const readZip = new ZipkitNode();
    try {
      const unlocked = await decryptAsRecipient(readZip, outputNzip, alice.privHex);

      const entries = (unlocked as any).getDirectory();
      const dataEntries = entries.filter(
        (e: any) => e.filename !== ACCESS_NZIP_PATH && !e.filename.startsWith('META-INF/'),
      );
      expect(dataEntries.length).toBeGreaterThanOrEqual(1);

      const content = await (unlocked as any).extractToBuffer(dataEntries[0]);
      expect(content.toString('utf8')).toBe('Hello, identity-based encryption!');
    } finally {
      await readZip.closeFile();
    }
  });

  it('supports multi-recipient encryption', async () => {
    const multiOut = path.join(tmpDir, 'multi.nzip');
    const zip = new ZipkitNode();

    await encryptForRecipients(zip, [testFile], multiOut, [aliceAddressIdentity, bobIdentity]);

    // Alice can decrypt
    const aliceZip = new ZipkitNode();
    try {
      await decryptAsRecipient(aliceZip, multiOut, alice.privHex);
      const aliceEntries = (aliceZip as any).getDirectory().filter(
        (e: any) => !e.filename.startsWith('META-INF/'),
      );
      const aliceContent = await (aliceZip as any).extractToBuffer(aliceEntries[0]);
      expect(aliceContent.toString('utf8')).toBe('Hello, identity-based encryption!');
    } finally {
      await aliceZip.closeFile();
    }

    // Bob can decrypt
    const bobZip = new ZipkitNode();
    try {
      await decryptAsRecipient(bobZip, multiOut, bob.privHex);
      const bobEntries = (bobZip as any).getDirectory().filter(
        (e: any) => !e.filename.startsWith('META-INF/'),
      );
      const bobContent = await (bobZip as any).extractToBuffer(bobEntries[0]);
      expect(bobContent.toString('utf8')).toBe('Hello, identity-based encryption!');
    } finally {
      await bobZip.closeFile();
    }
  });

  it('uses lit-protocol scheme for Lit PKP recipients', async () => {
    const pkpKeys = generateKeyPair();
    const pkpIdentity: ResolvedIdentity = {
      identity: `pkp:0x${'CC'.repeat(20)}`,
      identityType: 'lit-pkp',
      address: '0x' + 'CC'.repeat(20),
      publicKeyHex: pkpKeys.pubHex,
    };
    const pkpOut = path.join(tmpDir, 'pkp.nzip');
    const zip = new ZipkitNode();
    await encryptForRecipients(zip, [testFile], pkpOut, [pkpIdentity]);

    const z2 = new ZipkitNode();
    try {
      await z2.loadZipFile(pkpOut);
      const access = z2.getZipEntry(ACCESS_NZIP_PATH);
      expect(access).toBeTruthy();
      const raw = await z2.extractToBuffer(access, { skipHashCheck: true });
      const parsed = JSON.parse(raw.toString('utf8'));
      expect(parsed.scheme).toBe('lit-protocol');
      expect(parsed.recipients[0].identityType).toBe('lit-pkp');
    } finally {
      await z2.closeFile();
    }

    const pkpRead = new ZipkitNode();
    try {
      const unlocked = await decryptAsRecipient(pkpRead, pkpOut, pkpKeys.privHex);
      const dataEntries = (unlocked as any).getDirectory().filter(
        (e: any) => e.filename !== ACCESS_NZIP_PATH && !e.filename.startsWith('META-INF/'),
      );
      const content = await (unlocked as any).extractToBuffer(dataEntries[0]);
      expect(content.toString('utf8')).toBe('Hello, identity-based encryption!');
    } finally {
      await pkpRead.closeFile();
    }
  });

  it('rejects mixed identity types in one archive', async () => {
    const zip = new ZipkitNode();
    await expect(
      encryptForRecipients(zip, [testFile], path.join(tmpDir, 'bad.nzip'), [
        aliceIdentity,
        bobIdentity,
      ]),
    ).rejects.toThrow(/same identityType/i);
  });

  it('rejects decryption with wrong private key', async () => {
    const wrongKey = generateKeyPair();
    const readZip = new ZipkitNode();
    await expect(
      decryptAsRecipient(readZip, outputNzip, wrongKey.privHex),
    ).rejects.toThrow(/No matching recipient/);
  });
});
