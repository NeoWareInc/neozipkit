/**
 * Resolve an ENS name to an Ethereum address and secp256k1 encryption public key.
 *
 * The recipient must have published their uncompressed public key (hex, "04…")
 * as an ENS text record under the key "io.neozip.pubkey".
 */

import { ethers } from 'ethers';
import type { IdentityResolver, ResolvedIdentity } from './types';

/** ENS text-record key where the encryption public key is published. */
export const ENS_PUBKEY_RECORD = 'io.neozip.pubkey';

export class ENSResolver implements IdentityResolver {
  constructor(private provider: ethers.AbstractProvider) {}

  canResolve(identity: string): boolean {
    return identity.endsWith('.eth');
  }

  async resolve(identity: string): Promise<ResolvedIdentity> {
    const resolver = await (this.provider as ethers.JsonRpcProvider).getResolver(identity);
    if (!resolver) {
      throw new Error(`No ENS resolver found for "${identity}"`);
    }

    const address = await this.provider.resolveName(identity);
    if (!address) {
      throw new Error(`ENS name "${identity}" does not resolve to an address`);
    }

    const pubKey = await resolver.getText(ENS_PUBKEY_RECORD);
    if (!pubKey) {
      throw new Error(
        `ENS name "${identity}" has no "${ENS_PUBKEY_RECORD}" text record. ` +
          'The recipient must publish their encryption public key.',
      );
    }

    validateUncompressedSecp256k1PublicKey(pubKey);

    return {
      identity,
      identityType: 'ens',
      address: ethers.getAddress(address),
      publicKeyHex: normalizePublicKeyHex(pubKey),
    };
  }
}

/**
 * Resolve a raw Ethereum address to a ResolvedIdentity.
 * The caller must supply the public key directly (it cannot be discovered
 * on-chain from an address alone).
 */
export class AddressResolver implements IdentityResolver {
  canResolve(identity: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(identity);
  }

  async resolve(
    identity: string,
    publicKeyHex?: string,
  ): Promise<ResolvedIdentity> {
    if (!ethers.isAddress(identity)) {
      throw new Error(`Invalid Ethereum address: ${identity}`);
    }
    if (!publicKeyHex) {
      throw new Error(
        'A public key must be supplied when encrypting for a raw address ' +
          '(it cannot be derived on-chain from the address alone).',
      );
    }
    validateUncompressedSecp256k1PublicKey(publicKeyHex);
    return {
      identity,
      identityType: 'address',
      address: ethers.getAddress(identity),
      publicKeyHex: normalizePublicKeyHex(publicKeyHex),
    };
  }
}

/** Strip optional `0x` prefix from a hex public key string. */
export function normalizePublicKeyHex(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/** Require 65-byte uncompressed secp256k1 public key (hex, `04` prefix). */
export function validateUncompressedSecp256k1PublicKey(hex: string): void {
  const clean = normalizePublicKeyHex(hex);
  if (!/^04[0-9a-fA-F]{128}$/.test(clean)) {
    throw new Error(
      'Public key must be an uncompressed secp256k1 key (65 bytes, "04…" prefix). ' +
        `Got ${clean.length / 2} bytes.`,
    );
  }
}
