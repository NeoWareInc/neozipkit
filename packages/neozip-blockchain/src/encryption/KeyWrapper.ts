/**
 * ECIES key wrapping using secp256k1.
 *
 * Encrypt:
 *   1. Generate ephemeral secp256k1 key pair
 *   2. ECDH(ephemeral private, recipient public) → shared secret
 *   3. HKDF-SHA256(shared secret) → 32-byte wrapping key
 *   4. AES-256-GCM encrypt plaintext with wrapping key
 *
 * Decrypt:
 *   1. ECDH(recipient private, ephemeral public) → same shared secret
 *   2. HKDF-SHA256(shared secret) → same wrapping key
 *   3. AES-256-GCM decrypt ciphertext
 */

import * as crypto from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { WrappedKeyResult } from './types';

export const KEY_ALGORITHM_SECP256K1 = 'ecies-secp256k1-aes256gcm';
/** @deprecated Use KEY_ALGORITHM_SECP256K1 */
export const KEY_ALGORITHM = KEY_ALGORITHM_SECP256K1;
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const HKDF_INFO = Buffer.from('neozipkit-pro/ecies/v1', 'utf8');

function deriveWrappingKey(sharedSecret: Uint8Array): Buffer {
  const ikm = sharedSecret.slice(1); // drop the 0x04 prefix byte
  const derived = hkdf(sha256, ikm, undefined, HKDF_INFO, AES_KEY_BYTES);
  return Buffer.from(derived);
}

/**
 * Wrap (encrypt) plaintext so only the holder of `recipientPubKeyHex` can unwrap it.
 *
 * @param recipientPubKeyHex Uncompressed secp256k1 public key ("04…", 130 hex chars).
 * @param plaintext          The secret to protect (typically a hex-encoded AES password).
 */
export function wrapKey(
  recipientPubKeyHex: string,
  plaintext: Buffer,
): WrappedKeyResult {
  const recipientPub = hexToBytes(recipientPubKeyHex);

  const ephPriv = secp256k1.utils.randomPrivateKey();
  const ephPub = secp256k1.getPublicKey(ephPriv, false); // uncompressed

  const shared = secp256k1.getSharedSecret(ephPriv, recipientPub, false);
  const wrappingKey = deriveWrappingKey(shared);

  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // ciphertext layout: iv (12) || authTag (16) || encrypted data
  const ciphertextBuf = Buffer.concat([iv, tag, encrypted]);

  return {
    ciphertext: ciphertextBuf.toString('base64'),
    ephemeralPublicKey: Buffer.from(ephPub).toString('hex'),
    keyAlgorithm: KEY_ALGORITHM,
  };
}

/**
 * Unwrap (decrypt) ciphertext using the recipient's private key.
 *
 * @param recipientPrivKeyHex  Recipient's secp256k1 private key (hex, 64 chars).
 * @param ciphertextB64        Base64 string produced by `wrapKey`.
 * @param ephemeralPubKeyHex   Ephemeral public key from `wrapKey` result.
 * @returns The original plaintext buffer.
 */
export function unwrapKey(
  recipientPrivKeyHex: string,
  ciphertextB64: string,
  ephemeralPubKeyHex: string,
): Buffer {
  const recipientPriv = hexToBytes(recipientPrivKeyHex);
  const ephPub = hexToBytes(ephemeralPubKeyHex);

  const shared = secp256k1.getSharedSecret(recipientPriv, ephPub, false);
  const wrappingKey = deriveWrappingKey(shared);

  const ciphertextBuf = Buffer.from(ciphertextB64, 'base64');
  const iv = ciphertextBuf.subarray(0, GCM_IV_BYTES);
  const tag = ciphertextBuf.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);
  const encrypted = ciphertextBuf.subarray(GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted;
}

/**
 * Derive the public key (uncompressed, hex) from a private key. Useful for
 * matching a recipient entry in ACCESS.NZIP without knowing the identity string.
 */
export function publicKeyFromPrivate(privKeyHex: string): string {
  const priv = hexToBytes(privKeyHex);
  const pub = secp256k1.getPublicKey(priv, false);
  return Buffer.from(pub).toString('hex');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}
