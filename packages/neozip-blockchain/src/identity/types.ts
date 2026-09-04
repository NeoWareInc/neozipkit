/**
 * Types for identity resolution and recipient-based encryption.
 */

/** All values allowed in ACCESS.NZIP `identityType` and {@link ResolvedIdentity}. */
export const IDENTITY_TYPES = ['ens', 'address', 'did', 'lit-pkp', 'zipstamp'] as const;

export type IdentityType = (typeof IDENTITY_TYPES)[number];

export function isIdentityType(value: string): value is IdentityType {
  return (IDENTITY_TYPES as readonly string[]).includes(value);
}

export type EncryptionScheme = 'ens-hybrid' | 'address-hybrid' | 'did-hybrid' | 'lit-protocol';

export interface ResolvedIdentity {
  /** Original identity string the sender provided (e.g. "alice.eth", "0x…", "did:ethr:0x…"). */
  identity: string;
  identityType: IdentityType;
  /** Resolved Ethereum address (checksummed). Optional for zipstamp identities. */
  address: string;
  /**
   * Public key used for ECIES encryption (hex).
   * - secp256k1: uncompressed, "04…" prefix, 130 hex chars (65 bytes)
   * - x25519: raw, 64 hex chars (32 bytes)
   * Use `keyFormat` to determine which curve is in use.
   */
  publicKeyHex: string;
  /**
   * Curve/format of `publicKeyHex`. Defaults to 'secp256k1' if omitted for
   * backward compatibility with existing ACCESS.NZIP archives.
   */
  keyFormat?: 'secp256k1' | 'x25519';
}

export interface IdentityResolver {
  /**
   * Resolve a human-readable identity to an address + encryption public key.
   * @param publicKeyHex  Required for raw-address resolution where on-chain
   *                      lookup is not possible; ignored by ENS/DID resolvers.
   */
  resolve(identity: string, publicKeyHex?: string): Promise<ResolvedIdentity>;
  /** Whether this resolver can handle the given identity string. */
  canResolve(identity: string): boolean;
}
