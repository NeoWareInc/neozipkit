import { submitDigest, type TimestampMetadata } from '../token-service/TokenServiceHelpers';
import { getTokenServiceUrl, resolveNetworkProfile } from '../constants/servers';
import { getChainIdByName, getContractConfig } from '../core/contracts';
import { buildSubmitSidecar, type Sidecar } from '../sidecars/builders';
import { writeSidecars } from '../sidecars/write';
import { readSidecarsFromPath, resolveMerkleRoot, tryNormalizeRoot } from './internal';

export interface StampArchiveOptions {
  /** Precomputed v1 Merkle root (64-hex). Computed via `ZipReaderNode` when omitted. */
  merkleRoot?: string;
  /** Verified Token Service email. */
  email: string;
  /** Chain ID hint (server may pick the network). */
  chainId?: number;
  /** Network profile name (`"base-sepolia"`, `"base"`); used to resolve chain / server. */
  network?: string;
  /** Token Service URL (defaults per `getTokenServiceUrl`). */
  serverUrl?: string;
  /**
   * Write `TS-SUBMIT.NZIP` into the archive (default `true`). With `false` the
   * archive is untouched and only the sidecar is returned.
   */
  write?: boolean;
  /**
   * Re-stamp even when the archive already carries a `TIMESTAMP.NZIP` /
   * `TOKEN.NZIP` bound to the current root. Without it that case throws, because
   * a new submit removes those proofs (AppNote §8.4). Proofs bound to a
   * *different* root are stale (§8.6) and are always replaced.
   */
  force?: boolean;
  debug?: boolean;
}

export interface StampArchiveResult {
  merkleRoot: string;
  /** The `META-INF/TS-SUBMIT.NZIP` sidecar (already written unless `write: false`). */
  sidecar: Sidecar & { metadata: TimestampMetadata };
  /** Whether the archive was modified. */
  written: boolean;
}

/**
 * Submit the archive's Merkle root to the Token Service and record the pending
 * proof as `META-INF/TS-SUBMIT.NZIP` (stale `TIMESTAMP`/`TOKEN` sidecars are
 * removed, manifest `profiles` synced).
 */
export async function stampArchive(
  path: string,
  options: StampArchiveOptions
): Promise<StampArchiveResult> {
  if (!options?.email) throw new Error('stampArchive: email is required');
  const merkleRoot = await resolveMerkleRoot(path, options.merkleRoot);

  if (options.write !== false && options.force !== true) {
    let existing: ReturnType<typeof readSidecarsFromPath> = {};
    try {
      existing = readSidecarsFromPath(path);
    } catch {
      // Unreadable sidecars cannot be a valid proof; re-stamping replaces them.
    }
    const bound = [existing.timestamp?.digest, existing.token?.merkleRoot]
      .map(tryNormalizeRoot)
      .some((r) => r === merkleRoot);
    if (bound) {
      throw new Error(
        'Archive already has a TIMESTAMP/TOKEN proof for this Merkle root; pass force: true to re-stamp'
      );
    }
  }

  let chainId = options.chainId;
  if (chainId === undefined && options.network) {
    chainId = resolveNetworkProfile({ network: options.network, useEnv: false }).chainId;
  }
  const serverUrl = getTokenServiceUrl({
    serverUrl: options.serverUrl,
    network: options.network,
    chainId,
  });

  const response = await submitDigest(merkleRoot, options.email, chainId, {
    serverUrl,
    network: options.network,
    debug: options.debug,
  });
  if (!response.success) {
    throw new Error(response.error || 'Token Service rejected the digest');
  }

  const networkChainId = response.chainId ?? (response.network ? getChainIdByName(response.network) ?? 0 : 0);
  const metadata: TimestampMetadata = {
    digest: response.digest ?? merkleRoot,
    status: 'pending',
    contractAddress: networkChainId ? getContractConfig(networkChainId)?.address : undefined,
    network: response.network || 'unknown',
    chainId: networkChainId || undefined,
    batchId: response.batchId ?? null,
    batchNumber: response.batchNumber,
    serverUrl,
    submittedAt: new Date().toISOString(),
  };

  const built = buildSubmitSidecar(metadata);
  const write = options.write !== false;
  if (write) await writeSidecars(path, { add: [built] });

  return { merkleRoot, sidecar: { ...built, metadata }, written: write };
}
