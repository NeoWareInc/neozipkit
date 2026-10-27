import { ethers } from 'ethers';
import {
  prepareMint,
  checkNFTStatus,
  verifyDigest,
  type TimestampMetadata,
  type ExtendedTokenMetadata,
} from '../token-service/TokenServiceHelpers';
import { getTokenServiceUrl } from '../constants/servers';
import {
  NZIP_CONTRACT_ABI_V250,
  CONTRACT_CONFIGS,
  getChainIdByName,
} from '../core/contracts';
import { buildTokenSidecar, type Sidecar } from '../sidecars/builders';
import { writeSidecars } from '../sidecars/write';
import { readSidecarsFromPath, resolveMerkleRoot, tryNormalizeRoot } from './internal';

export interface MintTimestampProofOptions {
  /** Wallet private key (hex, with or without `0x`). Never persisted. */
  walletPrivateKey: string;
  /** Bearer token for membership-gated `prepare-mint` (production). */
  accessToken?: string;
  /** Network name; only used when `TIMESTAMP.NZIP` lacks a chain ID. */
  network?: string;
  /** Token Service URL (defaults to the one in `TIMESTAMP.NZIP`). */
  serverUrl?: string;
  /** RPC endpoint override. Defaults to the first configured RPC for the chain. */
  rpcUrl?: string;
  /** Precomputed v1 Merkle root; computed from the archive when omitted. */
  merkleRoot?: string;
  /** Write `TOKEN.NZIP` into the archive (default `true`). */
  write?: boolean;
  debug?: boolean;
}

export interface MintTimestampProofResult {
  merkleRoot: string;
  tokenId: string;
  transactionHash: string;
  blockNumber: number;
  owner: string;
  /** True when the digest was already minted and the existing token was reused. */
  alreadyMinted: boolean;
  metadata: ExtendedTokenMetadata;
  sidecar: Sidecar;
  written: boolean;
}

function errorText(error: unknown): string {
  if (error == null) return '';
  const e = error as { message?: string; reason?: string };
  const parts: string[] = [];
  if (typeof e.reason === 'string') parts.push(e.reason);
  if (typeof e.message === 'string') parts.push(e.message);
  return parts.length > 0 ? parts.join(' ') : String(error);
}

/**
 * Mint a TimestampProofNFT from a confirmed `META-INF/TIMESTAMP.NZIP` and write
 * `META-INF/TOKEN.NZIP`. The pending `TS-SUBMIT.NZIP` is removed; `TIMESTAMP.NZIP`
 * stays (the token binds the same root). Manifest `profiles` gain `"tokenized"`.
 *
 * Ported from the neozip-cli `mintTimestampProof` command (no CLI dependency).
 */
export async function mintTimestampProof(
  path: string,
  options: MintTimestampProofOptions
): Promise<MintTimestampProofResult> {
  if (!options?.walletPrivateKey) throw new Error('mintTimestampProof: walletPrivateKey is required');

  const sidecars = readSidecarsFromPath(path);
  const timestamp: TimestampMetadata | undefined = sidecars.timestamp;
  if (!timestamp) {
    throw new Error(
      'Archive must have a confirmed timestamp (META-INF/TIMESTAMP.NZIP). Run upgradeTimestamp() first.'
    );
  }
  const digest = tryNormalizeRoot(timestamp.digest);
  if (!digest) throw new Error('TIMESTAMP.NZIP has no valid digest');

  const merkleRoot = await resolveMerkleRoot(path, options.merkleRoot);
  if (merkleRoot !== digest) {
    throw new Error(
      'TIMESTAMP.NZIP does not match the archive content (Merkle root changed); re-stamp the archive'
    );
  }

  const chainId =
    timestamp.chainId ||
    (options.network ? getChainIdByName(options.network) ?? undefined : undefined) ||
    84532;
  const batchId = timestamp.batchId ?? undefined;
  const serverUrl = options.serverUrl ?? timestamp.serverUrl ?? getTokenServiceUrl({ chainId });
  const tsOpts = { serverUrl, accessToken: options.accessToken, debug: options.debug };

  // Already minted? Reuse the existing token instead of failing.
  const nftStatus = await checkNFTStatus(digest, chainId, tsOpts);

  const prepared = await prepareMint(digest, chainId, batchId, tsOpts);
  if (!prepared.success || !prepared.mintData) {
    throw new Error(prepared.error || 'Failed to prepare mint data');
  }
  const mintData = prepared.mintData;

  let tokenId: string;
  let transactionHash: string;
  let blockNumber: number;
  let owner: string;
  let alreadyMinted = false;

  if (nftStatus.isMinted && nftStatus.tokenId) {
    alreadyMinted = true;
    tokenId = nftStatus.tokenId;
    owner = nftStatus.owner || 'unknown';
    transactionHash = 'already-minted';
    blockNumber = 0;
  } else {
    const rpcUrl =
      options.rpcUrl ?? (chainId in CONTRACT_CONFIGS ? CONTRACT_CONFIGS[chainId].rpcUrls[0] : undefined);
    if (!rpcUrl) throw new Error(`No RPC URL for chain ID ${chainId}; pass rpcUrl`);

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    try {
      const key = options.walletPrivateKey;
      const wallet = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`, provider);
      owner = wallet.address;

      const mintFeeWei = BigInt(mintData.mintFeeWei);
      const balance = await provider.getBalance(wallet.address);
      if (balance < mintFeeWei) {
        throw new Error(`Insufficient balance. Required: ${mintData.mintFee} ETH`);
      }

      const nft = new ethers.Contract(mintData.nftContractAddress, NZIP_CONTRACT_ABI_V250, wallet);
      try {
        const tx = await nft.mintWithTimestampProof(
          mintData.digest,
          mintData.merkleProof,
          mintData.batchMerkleRoot,
          { value: mintFeeWei }
        );
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error('Transaction failed');
        transactionHash = receipt.hash;
        blockNumber = receipt.blockNumber;

        tokenId = '0';
        for (const log of receipt.logs ?? []) {
          try {
            const parsed = nft.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'TimestampProofMinted') {
              tokenId = parsed.args.tokenId.toString();
              break;
            }
          } catch {
            /* not our event */
          }
        }
      } catch (error) {
        if (!/already minted/i.test(errorText(error))) {
          throw new Error(`Mint failed: ${errorText(error)}`);
        }
        // Race: someone minted this digest between the status check and our tx.
        const existing = await checkNFTStatus(digest, chainId, tsOpts);
        let existingTokenId = existing.isMinted ? existing.tokenId : undefined;
        let existingOwner = existing.owner;
        let existingBlock = existing.proofData?.batchBlockNumber;
        if (!existingTokenId) {
          const v = await verifyDigest(digest, chainId, batchId, undefined, tsOpts);
          if (v.verified && v.tokenId) {
            existingTokenId = v.tokenId;
            existingBlock = v.blockNumber;
            existingOwner = (v as { owner?: string }).owner;
          }
        }
        if (!existingTokenId) {
          throw new Error(
            `Digest is already minted but token details could not be retrieved: ${errorText(error)}`
          );
        }
        alreadyMinted = true;
        tokenId = existingTokenId;
        owner = existingOwner ?? 'unknown';
        transactionHash = 'already-minted';
        blockNumber = existingBlock ?? 0;
      }
    } finally {
      provider.destroy?.();
    }
  }

  const metadata: ExtendedTokenMetadata = {
    tokenId,
    contractAddress: mintData.nftContractAddress,
    network: mintData.network,
    merkleRoot: mintData.digest,
    networkChainId: chainId,
    contractVersion: mintData.contractVersion,
    transactionHash,
    blockNumber,
    owner,
    mintedAt: new Date().toISOString(),
    timestampProof: {
      digest: mintData.digest,
      merkleProof: mintData.merkleProof,
      batchMerkleRoot: mintData.batchMerkleRoot,
      batchNumber: mintData.batchNumber,
      batchTransactionHash: mintData.batchTransactionHash,
      batchBlockNumber: mintData.batchBlockNumber,
      batchTimestamp: mintData.batchTimestamp,
      registryAddress: mintData.registryAddress,
      nftContractAddress: mintData.nftContractAddress,
      serverUrl: serverUrl ?? '',
    },
  };

  const sidecar = buildTokenSidecar(metadata);
  const write = options.write !== false;
  if (write) await writeSidecars(path, { add: [sidecar] });

  return {
    merkleRoot,
    tokenId,
    transactionHash,
    blockNumber,
    owner,
    alreadyMinted,
    metadata,
    sidecar,
    written: write,
  };
}
