/**
 * ECIES key wrapping using X25519 (Curve25519 Diffie-Hellman).
 *
 * X25519 is purpose-built for key agreement / secure messaging and is used by
 * Signal, WireGuard, TLS 1.3, and libsodium. The ZipStamp server provisions
 * X25519 key pairs for each user, so no additional key infrastructure is needed.
 *
 * Encrypt:
 *   1. Generate ephemeral X25519 key pair
 *   2. X25519(ephemeral private, recipient public) → 32-byte shared secret
 *   3. HKDF-SHA256(shared secret) → 32-byte wrapping key
 *   4. AES-256-GCM encrypt plaintext with wrapping key
 *
 * Decrypt:
 *   1. X25519(recipient private, ephemeral public) → same shared secret
 *   2. HKDF-SHA256(shared secret) → same wrapping key
 *   3. AES-256-GCM decrypt ciphertext
 */

import * as crypto from 'crypto';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { WrappedKeyResult } from './types';

export const KEY_ALGORITHM_X25519 = 'ecies-x25519-aes256gcm';
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const HKDF_INFO = Buffer.from('neozipkit-pro/ecies-x25519/v1', 'utf8');

function deriveWrappingKey(sharedSecret: Uint8Array): Buffer {
  const derived = hkdf(sha256, sharedSecret, undefined, HKDF_INFO, AES_KEY_BYTES);
  return Buffer.from(derived);
}

/**
 * Wrap (encrypt) plaintext so only the holder of `recipientPubKeyHex` can unwrap it.
 *
 * @param recipientPubKeyHex  Raw X25519 public key, 64 hex chars (32 bytes).
 *                            Obtained from ZipStamp GET /crypto/public → x25519PublicKey.
 * @param plaintext           The secret to protect (typically a hex-encoded AES password).
 */
export function wrapKeyX25519(
  recipientPubKeyHex: string,
  plaintext: Buffer,
): WrappedKeyResult {
  const clean = recipientPubKeyHex.startsWith('0x')
    ? recipientPubKeyHex.slice(2)
    : recipientPubKeyHex;
  const recipientPub = Uint8Array.from(Buffer.from(clean, 'hex'));

  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);

  const shared = x25519.getSharedSecret(ephPriv, recipientPub);
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
    keyAlgorithm: KEY_ALGORITHM_X25519,
  };
}

/**
 * Unwrap (decrypt) ciphertext using the recipient's X25519 private key.
 *
 * @param recipientPrivKeyHex  Recipient's X25519 private key (hex, 64 chars / 32 bytes).
 * @param ciphertextB64        Base64 string produced by `wrapKeyX25519`.
 * @param ephemeralPubKeyHex   Ephemeral public key from `wrapKeyX25519` result (64 hex chars).
 * @returns The original plaintext buffer.
 */
export function unwrapKeyX25519(
  recipientPrivKeyHex: string,
  ciphertextB64: string,
  ephemeralPubKeyHex: string,
): Buffer {
  const cleanPriv = recipientPrivKeyHex.startsWith('0x')
    ? recipientPrivKeyHex.slice(2)
    : recipientPrivKeyHex;
  const cleanEph = ephemeralPubKeyHex.startsWith('0x')
    ? ephemeralPubKeyHex.slice(2)
    : ephemeralPubKeyHex;

  const recipientPriv = Uint8Array.from(Buffer.from(cleanPriv, 'hex'));
  const ephPub = Uint8Array.from(Buffer.from(cleanEph, 'hex'));

  const shared = x25519.getSharedSecret(recipientPriv, ephPub);
  const wrappingKey = deriveWrappingKey(shared);

  const ciphertextBuf = Buffer.from(ciphertextB64, 'base64');
  const iv = ciphertextBuf.subarray(0, GCM_IV_BYTES);
  const tag = ciphertextBuf.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);
  const encrypted = ciphertextBuf.subarray(GCM_IV_BYTES + GCM_AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Derive the X25519 public key (hex, 64 chars) from a private key.
 * Useful for matching a recipient entry in ACCESS.NZIP.
 */
export function publicKeyFromPrivateX25519(privKeyHex: string): string {
  const clean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex;
  const priv = Uint8Array.from(Buffer.from(clean, 'hex'));
  const pub = x25519.getPublicKey(priv);
  return Buffer.from(pub).toString('hex');
}
