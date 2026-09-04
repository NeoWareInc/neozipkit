import { secp256k1 } from '@noble/curves/secp256k1';
import { wrapKey, unwrapKey, publicKeyFromPrivate, KEY_ALGORITHM } from '../../../src/encryption/KeyWrapper';

function generateKeyPair() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, false); // uncompressed
  return {
    privHex: Buffer.from(priv).toString('hex'),
    pubHex: Buffer.from(pub).toString('hex'),
  };
}

describe('KeyWrapper (ECIES)', () => {
  const plaintext = Buffer.from('a'.repeat(64), 'utf8'); // 64-char hex password
  const { privHex, pubHex } = generateKeyPair();

  it('round-trips: wrapKey → unwrapKey returns original plaintext', () => {
    const wrapped = wrapKey(pubHex, plaintext);
    const recovered = unwrapKey(privHex, wrapped.ciphertext, wrapped.ephemeralPublicKey);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('reports the correct algorithm', () => {
    const wrapped = wrapKey(pubHex, plaintext);
    expect(wrapped.keyAlgorithm).toBe(KEY_ALGORITHM);
  });

  it('produces different ciphertext on each call (random ephemeral key)', () => {
    const a = wrapKey(pubHex, plaintext);
    const b = wrapKey(pubHex, plaintext);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ephemeralPublicKey).not.toBe(b.ephemeralPublicKey);
  });

  it('rejects decryption with wrong private key', () => {
    const wrapped = wrapKey(pubHex, plaintext);
    const other = generateKeyPair();
    expect(() =>
      unwrapKey(other.privHex, wrapped.ciphertext, wrapped.ephemeralPublicKey),
    ).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const wrapped = wrapKey(pubHex, plaintext);
    const tampered = Buffer.from(wrapped.ciphertext, 'base64');
    tampered[tampered.length - 1] ^= 0xff; // flip last byte
    expect(() =>
      unwrapKey(privHex, tampered.toString('base64'), wrapped.ephemeralPublicKey),
    ).toThrow();
  });

  it('publicKeyFromPrivate matches the generated public key', () => {
    const derived = publicKeyFromPrivate(privHex);
    expect(derived).toBe(pubHex);
  });

  it('handles 0x-prefixed private key', () => {
    const derived = publicKeyFromPrivate('0x' + privHex);
    expect(derived).toBe(pubHex);
  });
});
