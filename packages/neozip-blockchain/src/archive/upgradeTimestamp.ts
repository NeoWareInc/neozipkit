import {
  verifyDigest,
  pollForConfirmation,
  type TimestampMetadata,
  type VerifyDigestResponse,
} from '../token-service/TokenServiceHelpers';
import { TS_SUBMIT_NZIP } from '../constants/metadata';
import { buildTimestampSidecar, type Sidecar } from '../sidecars/builders';
import { writeSidecars } from '../sidecars/write';
import { readSidecarsFromPath, resolveMerkleRoot, tryNormalizeRoot } from './internal';

export interface UpgradeTimestampOptions {
  /** Poll until confirmed (up to `timeoutMs`). Default: single check. */
  wait?: boolean;
  /** Poll timeout in ms (default 300000). */
  timeoutMs?: number;
  /** Poll interval in ms (default 5000). */
  pollIntervalMs?: number;
  /** Override the Token Service URL stored in `TS-SUBMIT.NZIP`. */
  serverUrl?: string;
  /**
   * Precomputed v1 Merkle root. When given, the submit digest is checked against
   * it; when omitted the root is computed from the archive.
   */
  merkleRoot?: string;
  /** Skip the check that the submit digest still matches the archive content. */
  skipMerkleCheck?: boolean;
  debug?: boolean;
}

export type UpgradeTimestampStatus =
  /** `TIMESTAMP.NZIP` written; `TS-SUBMIT.NZIP` removed. */
  | 'confirmed'
  /** Batch not confirmed yet. */
  | 'pending'
  /** Archive already had `TIMESTAMP.NZIP` (and no pending submit). */
  | 'already-confirmed'
  /** No Token Service sidecar present. */
  | 'none';

export interface UpgradeTimestampResult {
  status: UpgradeTimestampStatus;
  merkleRoot?: string;
  /** Present when `status === 'confirmed'`. */
  sidecar?: Sidecar & { metadata: TimestampMetadata };
  /** Raw Token Service response (when contacted). */
  response?: VerifyDigestResponse | null;
}

/**
 * Upgrade `META-INF/TS-SUBMIT.NZIP` (pending) to `META-INF/TIMESTAMP.NZIP`
 * (confirmed, with a Merkle proof) once the batch is on-chain.
 */
export async function upgradeTimestamp(
  path: string,
  options: UpgradeTimestampOptions = {}
): Promise<UpgradeTimestampResult> {
  const sidecars = readSidecarsFromPath(path);
  const submit = sidecars.submit;

  if (!submit) {
    return { status: sidecars.timestamp || sidecars.token ? 'already-confirmed' : 'none' };
  }
  if (sidecars.timestamp) {
    // §8.4: TIMESTAMP supersedes a leftover submit. Drop the stale pending sidecar.
    await writeSidecars(path, { remove: [TS_SUBMIT_NZIP] });
    return { status: 'already-confirmed' };
  }

  const digest = tryNormalizeRoot(submit.digest);
  if (!digest) throw new Error('TS-SUBMIT.NZIP has no valid digest');

  let merkleRoot = digest;
  if (!options.skipMerkleCheck) {
    merkleRoot = await resolveMerkleRoot(path, options.merkleRoot);
    if (merkleRoot !== digest) {
      throw new Error(
        'TS-SUBMIT.NZIP does not match the archive content (Merkle root changed); re-stamp the archive'
      );
    }
  }

  const chainId = submit.chainId && submit.chainId > 0 ? submit.chainId : undefined;
  const batchId = submit.batchId ?? undefined;
  const serverUrl = options.serverUrl ?? submit.serverUrl;
  const tsOpts = { serverUrl, debug: options.debug };

  let verified: VerifyDigestResponse | null;
  if (options.wait) {
    verified = await pollForConfirmation(
      digest,
      chainId,
      batchId,
      options.timeoutMs ?? 300000,
      options.pollIntervalMs ?? 5000,
      tsOpts
    );
  } else {
    verified = await verifyDigest(digest, chainId, batchId, undefined, tsOpts);
  }

  if (!verified || !verified.verified) {
    return { status: 'pending', merkleRoot, response: verified };
  }

  const metadata: TimestampMetadata = {
    ...submit,
    status: 'confirmed',
    merkleProof: verified.merkleProof ?? submit.merkleProof,
    merkleRoot: verified.merkleRoot ?? submit.merkleRoot,
    transactionHash: verified.transactionHash ?? submit.transactionHash,
    blockNumber: verified.blockNumber ?? submit.blockNumber,
    timestamp: verified.timestamp ?? submit.timestamp,
    contractAddress: verified.contractAddress ?? submit.contractAddress,
    tokenId: verified.tokenId ?? submit.tokenId,
    confirmedAt: new Date().toISOString(),
  };
  const built = buildTimestampSidecar(metadata);
  await writeSidecars(path, { add: [built] });

  return { status: 'confirmed', merkleRoot, sidecar: { ...built, metadata }, response: verified };
}
