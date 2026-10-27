import { ZipkitMinter, type MintingOptions, type MintingResult } from '../core/ZipkitMinter';
import type { TokenMetadata } from '../types';
import { buildTokenSidecar, type Sidecar } from '../sidecars/builders';
import { writeSidecars } from '../sidecars/write';
import { resolveMerkleRoot } from './internal';

export interface MintDirectOptions {
  /** Wallet private key (hex). Never persisted. */
  walletPrivateKey: string;
  /** Network name, e.g. `"base-sepolia"`. */
  network: string;
  /** Precomputed v1 Merkle root; computed from the archive when omitted. */
  merkleRoot?: string;
  /** RPC URL index into the configured list (default 0). */
  rpcUrlIndex?: number;
  /** Write `TOKEN.NZIP` into the archive (default `true`). */
  write?: boolean;
  debug?: boolean;
}

export interface MintDirectResult {
  merkleRoot: string;
  mintingResult: MintingResult;
  metadata: TokenMetadata;
  sidecar: Sidecar;
  written: boolean;
}

/**
 * Mint a token for the archive's Merkle root straight from the wallet
 * (`ZipkitMinter`, no Token Service timestamp required) and write
 * `META-INF/TOKEN.NZIP`. Stale `TS-SUBMIT.NZIP` is removed, `TIMESTAMP.NZIP`
 * is left alone, and manifest `profiles` gain `"tokenized"`.
 *
 * This does not check for existing tokens first; use `ZipkitMinter.checkForDuplicates`
 * beforehand if that matters.
 */
export async function mintDirect(path: string, options: MintDirectOptions): Promise<MintDirectResult> {
  if (!options?.walletPrivateKey) throw new Error('mintDirect: walletPrivateKey is required');
  if (!options?.network) throw new Error('mintDirect: network is required');

  const merkleRoot = await resolveMerkleRoot(path, options.merkleRoot);

  const minterOptions: MintingOptions = {
    walletPrivateKey: options.walletPrivateKey,
    network: options.network,
    rpcUrlIndex: options.rpcUrlIndex,
    debug: options.debug,
  };
  const minter = new ZipkitMinter(merkleRoot, minterOptions);
  try {
    const { mintingResult, tokenMetadata } = await minter.completeMinting();
    if (!mintingResult.success || !tokenMetadata) {
      throw new Error(mintingResult.message || 'Mint failed');
    }
    const sidecar = buildTokenSidecar(tokenMetadata);
    const write = options.write !== false;
    if (write) await writeSidecars(path, { add: [sidecar] });
    return { merkleRoot, mintingResult, metadata: tokenMetadata, sidecar, written: write };
  } finally {
    minter.destroy();
  }
}
