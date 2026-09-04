/**
 * Strategy-based identity resolver that dispatches to the first resolver
 * that can handle the given identity string.
 *
 * Usage:
 *   const dispatch = new IdentityResolverDispatch(provider);
 *   const resolved = await dispatch.resolve("alice.eth");
 *
 * Lit PKP: pass `LitPkpResolver` in `extra` or call `addResolver` after
 * construction so `pkp:0x…` is not mistaken for a raw address:
 *   dispatch.addResolver(new LitPkpResolver());
 *   await dispatch.resolve("pkp:0x…", pkpPublicKeyHex);
 */

import { ethers } from 'ethers';
import { ENSResolver, AddressResolver } from './ENSResolver';
import type { IdentityResolver, ResolvedIdentity } from './types';

export class IdentityResolverDispatch {
  private resolvers: IdentityResolver[];

  /**
   * @param provider  An ethers provider (needed for ENS lookups). May be omitted
   *                  when only resolving raw addresses with explicit public keys.
 * @param extra     Additional resolvers (e.g. LitPkpResolver, DID) appended
 *                  after the built-in ENS and Address resolvers.
   */
  constructor(
    provider?: ethers.AbstractProvider,
    extra: IdentityResolver[] = [],
  ) {
    this.resolvers = [];
    if (provider) {
      this.resolvers.push(new ENSResolver(provider));
    }
    this.resolvers.push(new AddressResolver());
    this.resolvers.push(...extra);
  }

  /** Register an additional resolver at the end of the chain. */
  addResolver(resolver: IdentityResolver): void {
    this.resolvers.push(resolver);
  }

  /**
   * Resolve an identity string to a verified address + public key.
   *
   * For raw addresses the caller must pass `publicKeyHex` because
   * on-chain resolution is not possible from an address alone.
   */
  async resolve(
    identity: string,
    publicKeyHex?: string,
  ): Promise<ResolvedIdentity> {
    for (const r of this.resolvers) {
      if (r.canResolve(identity)) {
        return r.resolve(identity, publicKeyHex);
      }
    }
    throw new Error(
      `No identity resolver can handle "${identity}". ` +
        'Supported formats: ENS names (*.eth), Ethereum addresses (0x…), ' +
        'and Lit PKP (pkp:0x… — register LitPkpResolver).',
    );
  }
}
