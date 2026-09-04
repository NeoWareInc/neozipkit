/**
 * Serialize and parse META-INF/ACCESS.NZIP — the JSON envelope that stores
 * ECIES-wrapped AES passwords and recipient identity information.
 */

import { VERSION } from '../version';
import { isIdentityType, type ResolvedIdentity } from '../identity/types';
import type {
  AccessControlMetadata,
  WrappedRecipient,
  WrappedKeyResult,
} from './types';

/** Well-known path inside a .nzip archive for recipient access control. */
export const ACCESS_NZIP_PATH = 'META-INF/ACCESS.NZIP';

/**
 * Build an AccessControlMetadata object from resolved identities and their
 * individually wrapped keys.
 */
export function buildAccessMetadata(
  recipients: Array<{ resolved: ResolvedIdentity; wrapped: WrappedKeyResult }>,
  scheme: AccessControlMetadata['scheme'] = 'ens-hybrid',
  innerZipEncryption: 'neo-aes256' | 'aes256' = 'neo-aes256',
): AccessControlMetadata {
  const encryptionInner =
    innerZipEncryption === 'aes256'
      ? {
          method: 'aes-256-winzip' as const,
          note: 'AES key derived via PBKDF2 from wrapped password (neozipkit AE-1)',
        }
      : {
          method: 'neo-aes256' as const,
          note: 'NeoEncrypt (NEO extra 0x024E); AES-256 via PBKDF2 from wrapped password (neozipkit)',
        };

  const wrappedRecipients: WrappedRecipient[] = recipients.map(
    ({ resolved, wrapped }) => ({
      identity: resolved.identity,
      identityType: resolved.identityType,
      resolvedAddress: resolved.address,
      publicKeyHex: resolved.publicKeyHex,
      wrappedKey: wrapped.ciphertext,
      ephemeralPublicKey: wrapped.ephemeralPublicKey,
      keyAlgorithm: wrapped.keyAlgorithm,
    }),
  );

  return {
    version: '1.0',
    scheme,
    recipients: wrappedRecipients,
    encryption: encryptionInner,
    created: new Date().toISOString(),
    proVersion: VERSION,
  };
}

/** Serialize metadata to a UTF-8 buffer suitable for writing as a ZIP entry. */
export function serializeAccessMetadata(
  metadata: AccessControlMetadata,
): Buffer {
  return Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Parse a raw buffer (extracted from META-INF/ACCESS.NZIP) back into typed metadata.
 * Throws on malformed JSON or missing required fields.
 */
export function parseAccessMetadata(raw: Buffer | string): AccessControlMetadata {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  const parsed = JSON.parse(text) as AccessControlMetadata;

  if (!parsed.version || !parsed.scheme || !Array.isArray(parsed.recipients)) {
    throw new Error('Invalid ACCESS.NZIP: missing version, scheme, or recipients');
  }

  for (const r of parsed.recipients) {
    if (!r.identityType || !isIdentityType(r.identityType)) {
      throw new Error(
        `Invalid ACCESS.NZIP recipient "${r.identity ?? '?'}": unknown or missing identityType`,
      );
    }
    if (!r.wrappedKey || !r.ephemeralPublicKey || !r.keyAlgorithm) {
      throw new Error(
        `Invalid ACCESS.NZIP recipient "${r.identity}": missing wrappedKey, ephemeralPublicKey, or keyAlgorithm`,
      );
    }
  }

  return parsed;
}
