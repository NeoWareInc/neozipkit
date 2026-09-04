/**
 * High-level orchestrator for identity-based (recipient) encryption.
 *
 * Encrypt workflow:
 *   1. Generate a random AES password (32 random bytes → hex)
 *   2. Create a NeoEncrypt (neo-aes256) encrypted .nzip via neozipkit by default
 *   3. For each recipient: ECIES-wrap the password with their public key
 *   4. Append META-INF/ACCESS.NZIP (STORED, unencrypted) with the wrapped keys
 *
 * Decrypt workflow:
 *   1. Load the .nzip and extract META-INF/ACCESS.NZIP
 *   2. Match the recipient by public key derived from the private key
 *   3. ECIES-unwrap → recover the AES password
 *   4. Set the password on the zipkit instance for normal extraction
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { wrapKey, unwrapKey, publicKeyFromPrivate, KEY_ALGORITHM_SECP256K1 } from './KeyWrapper';
import {
  wrapKeyX25519,
  unwrapKeyX25519,
  publicKeyFromPrivateX25519,
  KEY_ALGORITHM_X25519,
} from './KeyWrapperX25519';
import {
  ACCESS_NZIP_PATH,
  buildAccessMetadata,
  serializeAccessMetadata,
  parseAccessMetadata,
} from './AccessMetadata';
import type { ResolvedIdentity, EncryptionScheme, IdentityType } from '../identity/types';
import type { RecipientEncryptionFileInput, RecipientEncryptionOptions } from './types';

function normalizeRecipientEncryptionFiles(
  files: string[] | RecipientEncryptionFileInput[],
): RecipientEncryptionFileInput[] {
  if (files.length === 0) return [];
  const head = files[0];
  if (typeof head === 'string') {
    return (files as string[]).map((path) => ({ path }));
  }
  return files as RecipientEncryptionFileInput[];
}

/** Require every recipient to share the same {@link IdentityType} (v1 archives). */
function assertHomogeneousIdentityTypes(recipients: ResolvedIdentity[]): void {
  const first = recipients[0].identityType;
  for (let i = 1; i < recipients.length; i++) {
    if (recipients[i].identityType !== first) {
      throw new Error(
        `All recipients must use the same identityType (got "${first}" and "${recipients[i].identityType}"). ` +
          'Mixing Lit PKP with ENS/address recipients in one archive is not supported.',
      );
    }
  }
}

function encryptionSchemeForRecipients(recipients: ResolvedIdentity[]): EncryptionScheme {
  assertHomogeneousIdentityTypes(recipients);
  const t = recipients[0].identityType;
  if (t === 'lit-pkp') {
    return 'lit-protocol';
  }
  return `${t}-hybrid` as EncryptionScheme;
}

// ---------------------------------------------------------------------------
// Use dynamic import types so we don't force a compile-time dependency on the
// specific neozipkit/node path (keeps the module testable with mocks).
// At runtime, callers pass a real ZipkitNode instance.
// ---------------------------------------------------------------------------
interface ZipkitNodeLike {
  initializeZipFile(outputPath: string): Promise<any>;
  prepareEntryFromFile(filePath: string, entryName?: string): Promise<any>;
  writeZipEntry(writer: any, entry: any, filePath: string, options?: any): Promise<void>;
  writeCentralDirectory(writer: any, entries: any[], options?: any): Promise<number>;
  writeEndOfCentralDirectory(writer: any, count: number, size: number, offset: number): Promise<void>;
  finalizeZipFile(writer: any): Promise<void>;
  getDirectory(): any[];
  loadZipFile(filePath: string): Promise<any[]>;
  getZipEntry(filename: string): any | null;
  extractToBuffer(entry: any, options?: any): Promise<Buffer>;
  /** neozipkit ZipkitNode: close read handle opened by loadZipFile */
  closeFile?: () => Promise<void>;
}

async function closeZipReadHandle(zipkit: ZipkitNodeLike): Promise<void> {
  if (typeof zipkit.closeFile === 'function') {
    await zipkit.closeFile();
  }
}

/**
 * Create an encrypted .nzip file that can only be opened by the listed
 * recipients (via their secp256k1 public keys). Entry data uses **NeoEncrypt**
 * (`neo-aes256`, NEO extra `0x024E` in neozipkit) by default; set
 * `zipEncryptionMethod: 'aes256'` in options if you need WinZip AES.
 *
 * @param zipkit       A fresh ZipkitNode instance (will be mutated).
 * @param files        Paths only (`string[]`) or `{ path, entryName? }[]` — forwarded to neozipkit
 *                     `prepareEntryFromFile` / `writeZipEntry` (compress then encrypt).
 * @param outputPath   Where to write the .nzip.
 * @param recipients   Pre-resolved identities with public keys.
 * @param options      Compression and inner ZIP encryption options forwarded to neozipkit.
 */
export async function encryptForRecipients(
  zipkit: ZipkitNodeLike,
  files: string[] | RecipientEncryptionFileInput[],
  outputPath: string,
  recipients: ResolvedIdentity[],
  options?: RecipientEncryptionOptions,
): Promise<void> {
  if (recipients.length === 0) {
    throw new Error('At least one recipient is required');
  }
  const scheme = encryptionSchemeForRecipients(recipients);

  // 1. Generate a strong random password
  const aesPassword = crypto.randomBytes(32).toString('hex');

  // 2. Build compress options (NeoEncrypt / NEO extra 0x024E — see neozipkit)
  const encryptionMethod = options?.zipEncryptionMethod ?? 'neo-aes256';
  const compressOptions = {
    password: aesPassword,
    encryptionMethod,
    level: options?.level ?? 6,
    useSHA256: options?.useSHA256 ?? true,
    useZstd: options?.useZstd ?? false,
  };

  // 3. Create ZIP with encrypted content (neozipkit: compress plaintext, then encrypt)
  const writer = await zipkit.initializeZipFile(outputPath);

  try {
    for (const item of normalizeRecipientEncryptionFiles(files)) {
      const zipEntry = await zipkit.prepareEntryFromFile(item.path, item.entryName);
      if (item.entryName) {
        zipEntry.filename = item.entryName;
      }
      await zipkit.writeZipEntry(writer, zipEntry, item.path, compressOptions);
    }

    // 4. Wrap the password for each recipient using the appropriate key algorithm.
    // Key format is detected from keyFormat field, falling back to key length:
    //   x25519 public keys are 32 bytes (64 hex chars)
    //   secp256k1 public keys are 65 bytes (130 hex chars, uncompressed)
    const passwordBuf = Buffer.from(aesPassword, 'utf8');
    const wrappedPairs = recipients.map((resolved) => {
      const isX25519 =
        resolved.keyFormat === 'x25519' ||
        (resolved.keyFormat === undefined && resolved.publicKeyHex.replace(/^0x/, '').length === 64);
      const wrapped = isX25519
        ? wrapKeyX25519(resolved.publicKeyHex, passwordBuf)
        : wrapKey(resolved.publicKeyHex, passwordBuf);
      return { resolved, wrapped };
    });

    const metadata = buildAccessMetadata(wrappedPairs, scheme, encryptionMethod);
    const metadataBuffer = serializeAccessMetadata(metadata);

    // 5. Write ACCESS.NZIP as a STORED, unencrypted entry
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nzp-'));
    const tmpFile = path.join(tmpDir, 'ACCESS.NZIP');
    try {
      fs.writeFileSync(tmpFile, metadataBuffer);
      const metaEntry = await zipkit.prepareEntryFromFile(tmpFile);
      metaEntry.filename = ACCESS_NZIP_PATH;
      metaEntry.cmpMethod = 0; // STORED
      metaEntry.compressedSize = metadataBuffer.length;
      metaEntry.uncompressedSize = metadataBuffer.length;

      await zipkit.writeZipEntry(writer, metaEntry, tmpFile, {
        level: 0,
        useZstd: false,
        useSHA256: false,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 6. Write central directory + EOCD
    const entries = zipkit.getDirectory();
    const centralDirOffset = writer.currentPosition;
    const centralDirSize = await zipkit.writeCentralDirectory(writer, entries);
    await zipkit.writeEndOfCentralDirectory(
      writer,
      entries.length,
      centralDirSize,
      centralDirOffset,
    );
  } finally {
    await zipkit.finalizeZipFile(writer);
  }
}

/**
 * Recover the AES password from a recipient-encrypted .nzip and configure the
 * zipkit instance for extraction.
 *
 * After this call succeeds, use the returned zipkit normally:
 *   `const buf = await zipkit.extractToBuffer(entry);`
 *
 * @param zipkit            A ZipkitNode instance.
 * @param archivePath       Path to the .nzip file.
 * @param recipientPrivKey  Recipient's secp256k1 private key (hex).
 * @returns The same zipkit instance, now configured with the recovered password.
 */
export async function decryptAsRecipient(
  zipkit: ZipkitNodeLike,
  archivePath: string,
  recipientPrivKey: string,
): Promise<ZipkitNodeLike> {
  await closeZipReadHandle(zipkit);
  await zipkit.loadZipFile(archivePath);

  try {
    // 1. Extract ACCESS.NZIP
    const accessEntry = zipkit.getZipEntry(ACCESS_NZIP_PATH);
    if (!accessEntry) {
      throw new Error(
        `"${ACCESS_NZIP_PATH}" not found in archive. ` +
          'This file does not appear to be recipient-encrypted.',
      );
    }

    const rawMeta = await zipkit.extractToBuffer(accessEntry, { skipHashCheck: true });
    const metadata = parseAccessMetadata(rawMeta);

    // 2. Derive public key from the private key and find the matching recipient.
    // We try both secp256k1 and x25519 derivations since we don't know the key type
    // until we find a matching entry in ACCESS.NZIP.
    const cleanPriv = recipientPrivKey.startsWith('0x')
      ? recipientPrivKey.slice(2)
      : recipientPrivKey;

    const myPubKeySecp = publicKeyFromPrivate(cleanPriv);
    const myPubKeyX25519 = publicKeyFromPrivateX25519(cleanPriv);

    const match = metadata.recipients.find((r) => {
      const pub = r.publicKeyHex.toLowerCase();
      return pub === myPubKeySecp.toLowerCase() || pub === myPubKeyX25519.toLowerCase();
    });

    if (!match) {
      throw new Error(
        'No matching recipient found for the provided private key. ' +
          `Recipients: ${metadata.recipients.map((r) => r.identity).join(', ')}`,
      );
    }

    // 3. Unwrap the AES password using the algorithm recorded in ACCESS.NZIP
    let passwordBuf: Buffer;
    if (match.keyAlgorithm === KEY_ALGORITHM_X25519) {
      passwordBuf = unwrapKeyX25519(cleanPriv, match.wrappedKey, match.ephemeralPublicKey);
    } else if (
      match.keyAlgorithm === KEY_ALGORITHM_SECP256K1 ||
      match.keyAlgorithm === 'ecies-secp256k1-aes256gcm'
    ) {
      passwordBuf = unwrapKey(cleanPriv, match.wrappedKey, match.ephemeralPublicKey);
    } else {
      throw new Error(`Unsupported key algorithm in ACCESS.NZIP: ${match.keyAlgorithm}`);
    }
    const aesPassword = passwordBuf.toString('utf8');

    // 4. Set the password on the zipkit instance so extraction works
    (zipkit as any).password = aesPassword;

    return zipkit;
  } catch (err) {
    await closeZipReadHandle(zipkit);
    throw err;
  }
}
