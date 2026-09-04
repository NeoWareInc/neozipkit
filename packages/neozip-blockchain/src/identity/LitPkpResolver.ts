/**
 * Resolve a Lit Programmable Key Pair (PKP) identity for recipient encryption.
 *
 * Identities use the form `pkp:0x…` where `0x…` is the PKP’s Ethereum-style
 * wallet address. The uncompressed secp256k1 public key used for ECIES cannot be
 * derived from that address alone; callers must supply it (e.g. from Lit SDK,
 * Lit dashboard, or your indexer) via the `publicKeyHex` argument to
 * `IdentityResolver.resolve`, matching `AddressResolver`.
 */

import { ethers } from 'ethers';
import type { IdentityResolver, ResolvedIdentity } from './types';
import {
  normalizePublicKeyHex,
  validateUncompressedSecp256k1PublicKey,
} from './ENSResolver';

/** Literal prefix for PKP identities (`pkp:` + 0x + 40 hex). */
export const LIT_PKP_IDENTITY_PREFIX = 'pkp:' as const;

const PKP_IDENTITY = /^pkp:(0x[0-9a-fA-F]{40})$/;

export class LitPkpResolver implements IdentityResolver {
  canResolve(identity: string): boolean {
    return PKP_IDENTITY.test(identity.trim());
  }

  async resolve(identity: string, publicKeyHex?: string): Promise<ResolvedIdentity> {
    const trimmed = identity.trim();
    const m = trimmed.match(PKP_IDENTITY);
    if (!m) {
      throw new Error(
        `Invalid Lit PKP identity "${identity}". Expected ${LIT_PKP_IDENTITY_PREFIX}0x followed by 40 hex characters.`,
      );
    }

    const address = ethers.getAddress(m[1]);

    if (!publicKeyHex) {
      throw new Error(
        'A public key must be supplied for Lit PKP recipients ' +
          '(it cannot be derived from the PKP address alone). ' +
          'Use Lit tooling to obtain the PKP uncompressed secp256k1 public key and pass publicKeyHex.',
      );
    }

    validateUncompressedSecp256k1PublicKey(publicKeyHex);

    return {
      identity: trimmed,
      identityType: 'lit-pkp',
      address,
      publicKeyHex: normalizePublicKeyHex(publicKeyHex),
    };
  }
}
