/**
 * Types for ECIES key wrapping and the ACCESS.NZIP metadata format.
 */

import type { IdentityType, EncryptionScheme } from '../identity/types';

/** Result of ECIES key wrapping. */
export interface WrappedKeyResult {
  /** ECIES ciphertext (base64). */
  ciphertext: string;
  /** Ephemeral public key used for ECDH (hex, uncompressed). */
  ephemeralPublicKey: string;
  /** Algorithm identifier stored in metadata. */
  keyAlgorithm: string;
}

/** A single recipient entry inside ACCESS.NZIP. */
export interface WrappedRecipient {
  identity: string;
  identityType: IdentityType;
  resolvedAddress: string;
  publicKeyHex: string;
  wrappedKey: string;
  ephemeralPublicKey: string;
  keyAlgorithm: string;
}

/** Top-level ACCESS.NZIP JSON schema. */
export interface AccessControlMetadata {
  version: string;
  scheme: EncryptionScheme;
  recipients: WrappedRecipient[];
  encryption: {
    method: string;
    note?: string;
  };
  created: string;
  proVersion: string;
}

/**
 * One input file for recipient-encrypted archive creation.
 * Matches neozipkit `prepareEntryFromFile(path, entryName)`; compression and
 * encryption order are handled entirely by neozipkit `writeZipEntry`.
 */
export interface RecipientEncryptionFileInput {
  path: string;
  /** ZIP entry name; when omitted, neozipkit uses the basename of `path`. */
  entryName?: string;
}

/** Options accepted by RecipientEncryption. */
export interface RecipientEncryptionOptions {
  /** Compression level (0–9). */
  level?: number;
  /** Use SHA-256 hashes in ZIP entries. */
  useSHA256?: boolean;
  /** Use Zstd instead of DEFLATE. */
  useZstd?: boolean;
  /**
   * Inner ZIP entry encryption (`CompressOptions.encryptionMethod` in neozipkit).
   * Defaults to **NeoEncrypt** (`neo-aes256`). Use `'aes256'` only for WinZip AE-1/AE-2–compatible archives.
   */
  zipEncryptionMethod?: 'aes256' | 'neo-aes256';
}
