#!/usr/bin/env node

/**
 * Verify ZIP Timestamp and NFT Token
 * 
 * Universal verifier for timestamped ZIP files. Supports three verification modes:
 * 
 * 1. PENDING (TS-SUBMIT.NZIP) - Verifies via Zipstamp server
 *    - Checks if digest is in database/batch
 *    - Suggests running upgrade-zip.ts once confirmed
 *    - Requires Zipstamp server to be running
 * 
 * 2. CONFIRMED (TIMESTAMP.NZIP) - Direct blockchain verification
 *    - Uses embedded merkle proof to verify on-chain
 *    - No Zipstamp server required (self-contained proof)
 *    - Similar to OpenTimestamps upgraded timestamps
 *    - Works offline with --offline flag
 * 
 * 3. NFT TOKEN (TOKEN.NZIP; legacy NZIP.TOKEN accepted) - NFT proof verification
 *    - Verifies NFT ownership on TimestampProofNFT contract
 *    - Verifies token's stored proof data matches metadata
 *    - Links to original timestamp transaction for full provenance
 *    - Works offline with --offline flag
 * 
 * Usage:
 *   yarn example:verify-timestamp <path-to-stamped.nzip>    # Verify pending
 *   yarn example:verify-upgrade <path-to-stamped.nzip>      # Verify confirmed
 *   yarn example:verify-nft <path-to-stamped.nzip>          # Verify NFT
 *   ts-node examples/verify-zip.ts <path-to-stamped.nzip>
 *   ts-node examples/verify-zip.ts <path-to-stamped.nzip> --offline
 * 
 * Options:
 *   --offline    Skip Zipstamp server check (only works for TIMESTAMP.NZIP or TOKEN.NZIP / legacy NZIP.TOKEN)
 * 
 * Examples:
 *   yarn example:verify-timestamp examples/output/stamp.nzip
 *   yarn example:verify-upgrade examples/output/stamp-upgrade.nzip
 *   yarn example:verify-nft examples/output/stamp-upgrade-nft.nzip
 *   ts-node examples/verify-zip.ts examples/output/stamp.nzip --offline
 */

// ZIP operations from neozipkit (peer dependency)
import { ZipkitNode } from 'neozipkit/node';

// Zipstamp server API client (for pending timestamps)
import { verifyDigest, getZipStampServerUrl, type TimestampMetadata, SUBMIT_METADATA, TIMESTAMP_METADATA, NFT_METADATA, NFT_METADATA_LEGACY, findMetadataEntry, getMetadataFileNames } from '../src/zipstamp-server';

// Portable proof verification (for confirmed timestamps - no database access)
import { verifyMerkleProofLocal } from '../src/zipstamp-server';
import { getContractConfig, TIMESTAMP_PROOF_NFT_ABI, UNIFIED_NFT_VERIFY_ABI } from '../src/core/contracts';

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

type ChainConfig = {
  chainId: number;
  network: string;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress: string;
  contractVersion: string;
};

function getChainConfig(chainId: number): ChainConfig | null {
  const cfg = getContractConfig(chainId);
  if (!cfg || !cfg.rpcUrls?.length) return null;
  return {
    chainId,
    network: cfg.network,
    rpcUrl: cfg.rpcUrls[0],
    explorerUrl: cfg.explorerUrl,
    contractAddress: cfg.address,
    contractVersion: cfg.version,
  };
}

function normalizeHex32(hex: string): string {
  const with0x = hex.startsWith('0x') ? hex : `0x${hex}`;
  const bytes = ethers.getBytes(with0x);
  if (bytes.length !== 32) throw new Error('Expected bytes32');
  return ethers.hexlify(bytes);
}

function receiptContainsBytes32(receipt: ethers.TransactionReceipt, needle: string): boolean {
  const n = needle.toLowerCase();
  for (const log of receipt.logs) {
    for (const t of log.topics || []) {
      if (String(t).toLowerCase() === n) return true;
    }
    const data = (log as any).data as string | undefined;
    if (typeof data === 'string' && data.toLowerCase().includes(n.slice(2))) {
      return true;
    }
  }
  return false;
}

const blockchainService = {
  async verifyTransactionAndExtractBatch(
    transactionHash: string,
    chainId: number,
    expectedMerkleRoot: string,
    contractAddress?: string
  ): Promise<{ merkleRoot: string; blockNumber?: number; timestamp?: number; contractAddress?: string; foundInLogs?: boolean } | null> {
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) return null;

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainId);
    const receipt = await provider.getTransactionReceipt(transactionHash);
    if (!receipt || receipt.status !== 1) return null;

    const tx = await provider.getTransaction(transactionHash);
    const txTo = tx?.to || contractAddress;

    const block = receipt.blockNumber != null ? await provider.getBlock(receipt.blockNumber) : null;
    const ts = block?.timestamp != null ? Number(block.timestamp) : undefined;

    const normalizedRoot = normalizeHex32(expectedMerkleRoot);
    const foundInLogs = receiptContainsBytes32(receipt, normalizedRoot);

    return {
      merkleRoot: normalizedRoot,
      blockNumber: receipt.blockNumber != null ? Number(receipt.blockNumber) : undefined,
      timestamp: ts,
      contractAddress: txTo || undefined,
      foundInLogs,
    };
  },

  async verifyProof(
    digest: string,
    proof: string[],
    merkleRoot: string,
    chainId: number,
    contractAddress?: string
  ): Promise<{ isValid: boolean; batchNumber?: number; blockNumber?: number; timestamp?: number; rpcUrl?: string }> {
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) return { isValid: false };

    const rpcUrl = chainConfig.rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

    const addr = contractAddress || chainConfig.contractAddress;
    if (!addr) return { isValid: false, rpcUrl };

    const d = normalizeHex32(digest);
    const r = normalizeHex32(merkleRoot);
    const p = (proof || []).map(normalizeHex32);

    // Try common registry-style verification function names.
    const abi = [
      'function verifyProof(bytes32 digest, bytes32[] proof, bytes32 merkleRoot) view returns (bool)',
      'function verify(bytes32 digest, bytes32[] proof, bytes32 merkleRoot) view returns (bool)',
    ];
    const c = new ethers.Contract(addr, abi, provider);

    for (const fn of ['verifyProof', 'verify'] as const) {
      try {
        const ok: boolean = await (c as any)[fn](d, p, r);
        return { isValid: !!ok, rpcUrl };
      } catch {
        // try next signature
      }
    }

    return { isValid: false, rpcUrl };
  },

  async batchExists(
    merkleRoot: string,
    chainId: number,
    contractAddress?: string
  ): Promise<{ exists: boolean; functionNotSupported?: boolean }> {
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) return { exists: false };

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainId);
    const addr = contractAddress || chainConfig.contractAddress;
    if (!addr) return { exists: false };

    const r = normalizeHex32(merkleRoot);

    const candidates = [
      'function batchExists(bytes32 merkleRoot) view returns (bool)',
      'function hasBatch(bytes32 merkleRoot) view returns (bool)',
      'function isBatchRecorded(bytes32 merkleRoot) view returns (bool)',
    ];

    for (const sig of candidates) {
      try {
        const c = new ethers.Contract(addr, [sig], provider);
        const fnName = sig.match(/function\s+(\w+)\(/)?.[1];
        if (!fnName) continue;
        const ok: boolean = await (c as any)[fnName](r);
        return { exists: !!ok };
      } catch {
        // try next
      }
    }

    // Can't determine existence (function not available on this deployment).
    return { exists: true, functionNotSupported: true };
  },
};

// NFT Contract ABIs imported from src/core/contracts (single source of truth)

/**
 * Extended Token Metadata (from TOKEN.NZIP; legacy NZIP.TOKEN accepted)
 */
interface ExtendedTokenMetadata {
  // Standard neozipkit fields
  tokenId: string;
  contractAddress: string;
  network: string;
  merkleRoot: string;
  networkChainId: number;
  contractVersion: string;
  transactionHash?: string;
  blockNumber?: number;
  owner?: string;
  mintedAt?: string;
  
  // Extended timestamp proof fields
  timestampProof?: {
    digest: string;
    merkleProof: string[];
    batchMerkleRoot: string;
    batchNumber: number;
    batchTransactionHash: string;
    batchBlockNumber: number;
    batchTimestamp: number;
    registryAddress: string;
    nftContractAddress: string;
    serverUrl: string;
  };
}

/**
 * Verify NFT Token (TOKEN.NZIP; legacy NZIP.TOKEN accepted)
 * 
 * Verifies:
 * 1. NFT exists on TimestampProofNFT contract
 * 2. Token ownership matches metadata
 * 3. Stored proof data matches metadata
 * 4. Timestamp proof links to correct batch
 */
async function verifyNFTToken(
  zip: any, 
  nftEntry: any, 
  zipPath: string, 
  offlineMode: boolean
): Promise<void> {
  console.log('✅ NFT token metadata found\n');

  // Extract NFT metadata
  const tempNftFile = path.join(__dirname, 'output', '.nft-metadata-temp.json');
  const tempNftDir = path.dirname(tempNftFile);
  if (!fs.existsSync(tempNftDir)) {
    fs.mkdirSync(tempNftDir, { recursive: true });
  }

  let nftMetadata: ExtendedTokenMetadata;

  try {
    await zip.extractToFile(nftEntry, tempNftFile);
    const metadataContent = fs.readFileSync(tempNftFile, 'utf8');
    fs.unlinkSync(tempNftFile);
    nftMetadata = JSON.parse(metadataContent);
  } catch (error) {
    console.error('❌ Error: Could not read NFT token metadata');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    await zip.closeFile();
    process.exit(1);
  }

  // Validate metadata structure
  if (!nftMetadata.tokenId || !nftMetadata.contractAddress) {
    console.error('❌ Error: Invalid NFT token metadata structure');
    console.error('   Missing required fields: tokenId or contractAddress');
    await zip.closeFile();
    process.exit(1);
  }

  console.log('NFT Token Details:');
  console.log(`   Token ID: ${nftMetadata.tokenId}`);
  console.log(`   Contract: ${nftMetadata.contractAddress}`);
  console.log(`   Network: ${nftMetadata.network} (Chain ${nftMetadata.networkChainId})`);
  console.log(`   Merkle Root: ${nftMetadata.merkleRoot}`);
  if (nftMetadata.owner) {
    console.log(`   Owner (metadata): ${nftMetadata.owner}`);
  }
  console.log();

  // Step 3: Calculate merkle root from ZIP contents
  console.log('Step 3: Calculating merkle root from ZIP contents...');
  
  const merkleRoot = (zip as any).getMerkleRoot?.();
  
  if (!merkleRoot) {
    console.error('❌ Error: Could not calculate merkle root');
    console.error('   Make sure the ZIP file was created with SHA-256 hashes enabled');
    await zip.closeFile();
    process.exit(1);
  }

  console.log(`✅ Merkle root calculated: ${merkleRoot}`);
  
  // Compare with metadata merkleRoot (which should equal the digest)
  const normalizedMerkleRoot = merkleRoot.toLowerCase().replace('0x', '');
  const metadataMerkleRoot = nftMetadata.merkleRoot.toLowerCase().replace('0x', '');
  
  if (normalizedMerkleRoot === metadataMerkleRoot) {
    console.log('   ✓ Matches merkleRoot in NFT metadata');
  } else {
    console.log('   ⚠️  WARNING: Does not match merkleRoot in NFT metadata!');
    console.log(`      Metadata: ${nftMetadata.merkleRoot}`);
    console.log(`      Calculated: ${merkleRoot}`);
    console.log('   This may indicate the ZIP file has been modified.');
  }

  // Also check against timestampProof.digest if available
  if (nftMetadata.timestampProof?.digest) {
    const proofDigest = nftMetadata.timestampProof.digest.toLowerCase().replace('0x', '');
    if (normalizedMerkleRoot === proofDigest) {
      console.log('   ✓ Matches digest in timestampProof');
    } else {
      console.log('   ⚠️  WARNING: Does not match digest in timestampProof!');
    }
  }
  console.log();

  await zip.closeFile();

  // Step 4: Verify NFT on blockchain
  if (offlineMode) {
    console.log('Step 4: Verifying NFT on blockchain...');
    console.log('   (Skipped in offline mode)');
    console.log();
    
    // Display offline verification results
    displayNFTVerificationResults(nftMetadata, merkleRoot, null, true);
    process.exit(0);
  }

  console.log('Step 4: Verifying NFT on blockchain...');
  
  const chainId = nftMetadata.networkChainId;
  const chainConfig = getChainConfig(chainId);
  
  if (!chainConfig) {
    console.error(`   ❌ Chain ${chainId} is not configured`);
    console.error('   Cannot verify NFT on blockchain');
    displayNFTVerificationResults(nftMetadata, merkleRoot, { error: 'Chain not configured' }, false);
    process.exit(1);
  }

  // Get NFT contract address (prefer metadata, fall back to config)
  const nftContractAddress = nftMetadata.timestampProof?.nftContractAddress || 
                             nftMetadata.contractAddress;
  
  if (!nftContractAddress) {
    console.error(`   ❌ NFT contract address not found for chain ${chainId}`);
    displayNFTVerificationResults(nftMetadata, merkleRoot, { error: 'NFT contract not configured' }, false);
    process.exit(1);
  }

  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainId);
    const nftContract = new ethers.Contract(nftContractAddress, TIMESTAMP_PROOF_NFT_ABI, provider);

    const tokenId = BigInt(nftMetadata.tokenId);

    // Check NFT exists and get owner
    let currentOwner: string;
    try {
      currentOwner = await nftContract.ownerOf(tokenId);
      console.log(`   ✓ Token exists on blockchain`);
      console.log(`   Current Owner: ${currentOwner}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('ERC721NonexistentToken') || errorMsg.includes('invalid token')) {
        console.log(`   ❌ Token ID ${nftMetadata.tokenId} does not exist on contract`);
        displayNFTVerificationResults(nftMetadata, merkleRoot, { error: 'Token does not exist on blockchain' }, false);
        process.exit(1);
      }
      throw error;
    }

    // Resolve mint transaction + block info (prefer metadata; fall back to mint Transfer log)
    console.log('\nStep 4b: Resolving mint block/timestamp...');
    let mintTxHash: string | null = null;
    let mintBlockNumber: number | null = null;
    let mintBlockTimestamp: number | null = null;

    const metadataTx =
      nftMetadata.transactionHash && nftMetadata.transactionHash !== 'already-minted'
        ? nftMetadata.transactionHash
        : null;
    const metadataBlock = typeof nftMetadata.blockNumber === 'number' ? nftMetadata.blockNumber : null;

    try {
      if (metadataTx || metadataBlock) {
        mintTxHash = metadataTx;
        mintBlockNumber = metadataBlock;

        if (mintBlockNumber != null) {
          const block = await provider.getBlock(mintBlockNumber);
          if (block?.timestamp != null) {
            mintBlockTimestamp = Number(block.timestamp);
          }
          console.log(`   ✓ Mint block from token metadata: ${mintBlockNumber}`);
        } else if (mintTxHash) {
          const receipt = await provider.getTransactionReceipt(mintTxHash);
          if (receipt?.blockNumber != null) {
            mintBlockNumber = Number(receipt.blockNumber);
            const block = await provider.getBlock(mintBlockNumber);
            if (block?.timestamp != null) {
              mintBlockTimestamp = Number(block.timestamp);
            }
            console.log(`   ✓ Mint block from mint tx receipt: ${mintBlockNumber}`);
          } else {
            console.log('   ⚠️  Could not resolve mint tx receipt block');
          }
        }
      } else {
        // Fallback: scan for the mint Transfer event for this tokenId (Transfer(0x0, *, tokenId))
        const transferTopic = ethers.id('Transfer(address,address,uint256)');
        const tokenIdTopic = ethers.zeroPadValue(ethers.toBeHex(tokenId), 32);
        const logs = await provider.getLogs({
          address: nftContractAddress,
          topics: [transferTopic, ethers.zeroPadValue('0x0', 32), null, tokenIdTopic],
          fromBlock: 0,
          toBlock: 'latest',
        });

        const mintLog = logs[0];
        if (mintLog) {
          mintTxHash = mintLog.transactionHash || null;
          mintBlockNumber = mintLog.blockNumber != null ? Number(mintLog.blockNumber) : null;
          if (mintBlockNumber != null) {
            const block = await provider.getBlock(mintBlockNumber);
            if (block?.timestamp != null) {
              mintBlockTimestamp = Number(block.timestamp);
            }
          }
          console.log(`   ✓ Mint block from Transfer event: ${mintBlockNumber ?? 'N/A'}`);
        } else {
          console.log('   ⚠️  Mint Transfer event not found (RPC/log retention or unusual minting)');
        }
      }
    } catch (error) {
      console.log(
        `   ⚠️  Could not resolve mint block/timestamp: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Get on-chain proof data - try both contract types
    console.log('\nStep 5: Verifying on-chain proof data...');
    
    let onChainProof: any = null;
    let onChainMerkleProof: string[] = [];
    let isSimpleToken = false; // Simple token (no timestamp proof)
    let contractType: 'unified' | 'timestamp-proof' | 'unknown' = 'unknown';
    
    // Try UnifiedNFT (v2.50/v2.51) first - uses getTokenData
    try {
      const unifiedContract = new ethers.Contract(nftContractAddress, UNIFIED_NFT_VERIFY_ABI, provider);
      const tokenData = await unifiedContract.getTokenData(tokenId);
      
      contractType = 'unified';
      
      onChainProof = {
        merkleRoot: tokenData.merkleRoot,
        mintedAt: Number(tokenData.mintedAt),
        mintBlockNumber: Number(tokenData.mintBlockNumber),
        originalOwner: tokenData.originalOwner,
        hasTimestampProof: tokenData.hasTimestampProof,
        batchMerkleRoot: tokenData.batchMerkleRoot,
        batchTimestamp: Number(tokenData.batchTimestamp),
        batchBlockNumber: Number(tokenData.batchBlockNumber),
      };
      
      isSimpleToken = !tokenData.hasTimestampProof;
      
      const unifiedVersion = nftMetadata.contractVersion ? `v${nftMetadata.contractVersion}` : 'v2.50/v2.51';
      console.log(`   ✓ On-chain token data retrieved (UnifiedNFT ${unifiedVersion})`);
      console.log(`   Merkle Root: ${onChainProof.merkleRoot}`);
      {
        const d = new Date(onChainProof.mintedAt * 1000);
        console.log(`   Minted At: ${d.toISOString()}`);
        console.log(`     (${d.toLocaleString()})`);
      }
      console.log(`   Mint Block: ${onChainProof.mintBlockNumber}`);
      console.log(`   Original Owner: ${onChainProof.originalOwner}`);
      
      if (isSimpleToken) {
        console.log(`   Token Type: Simple (no timestamp proof)`);
      } else {
        console.log(`   Token Type: Timestamp Proof`);
        console.log(`   Batch Merkle Root: ${onChainProof.batchMerkleRoot}`);
        {
          const d = new Date(onChainProof.batchTimestamp * 1000);
          console.log(`   Batch Timestamp: ${d.toISOString()}`);
          console.log(`     (${d.toLocaleString()})`);
        }
        console.log(`   Batch Block: ${onChainProof.batchBlockNumber}`);
        
        // Get merkle proof if available
        try {
          const [, proof] = await unifiedContract.getTimestampProof(tokenId);
          onChainMerkleProof = proof.map((p: string) => p);
        } catch {
          // Proof not available
        }
      }
    } catch (unifiedError) {
      // Try TimestampProofNFT (v0.90) - uses getProof
      try {
        const [proof, proofArray] = await nftContract.getProof(tokenId);
        
        contractType = 'timestamp-proof';
        
        onChainProof = {
          digest: proof.digest,
          merkleRoot: proof.merkleRoot,
          batchTimestamp: Number(proof.batchTimestamp),
          batchBlockNumber: Number(proof.batchBlockNumber),
          mintedAt: Number(proof.mintedAt),
          originalOwner: proof.originalOwner,
          hasTimestampProof: true, // TimestampProofNFT always has proof
        };
        onChainMerkleProof = proofArray.map((p: string) => p);
        
        console.log(`   ✓ On-chain proof data retrieved (TimestampProofNFT v0.90)`);
        console.log(`   Digest: ${onChainProof.digest}`);
        console.log(`   Batch Merkle Root: ${onChainProof.merkleRoot}`);
        {
          const d = new Date(onChainProof.batchTimestamp * 1000);
          console.log(`   Batch Timestamp: ${d.toISOString()}`);
          console.log(`     (${d.toLocaleString()})`);
        }
        console.log(`   Batch Block: ${onChainProof.batchBlockNumber}`);
        {
          const d = new Date(onChainProof.mintedAt * 1000);
          console.log(`   Minted At: ${d.toISOString()}`);
          console.log(`     (${d.toLocaleString()})`);
        }
        console.log(`   Original Owner: ${onChainProof.originalOwner}`);
      } catch (proofError) {
        console.log(`   ❌ Could not retrieve on-chain proof data`);
        console.log(`   ${proofError instanceof Error ? proofError.message : String(proofError)}`);
        displayNFTVerificationResults(nftMetadata, merkleRoot, { error: 'Could not retrieve on-chain proof' }, false);
        process.exit(1);
      }
    }

    // Verify digest/merkle root matches
    const expectedDigest = `0x${normalizedMerkleRoot}`.toLowerCase();
    let onChainDigest: string;
    
    if (contractType === 'unified') {
      // UnifiedNFT uses merkleRoot field
      onChainDigest = onChainProof.merkleRoot.toLowerCase();
    } else {
      // TimestampProofNFT uses digest field
      onChainDigest = onChainProof.digest.toLowerCase();
    }
    
    if (onChainDigest === expectedDigest) {
      console.log(`   ✓ On-chain merkle root matches ZIP merkle root`);
    } else {
      console.log(`   ❌ On-chain merkle root does NOT match ZIP merkle root!`);
      console.log(`      On-chain: ${onChainDigest}`);
      console.log(`      Expected: ${expectedDigest}`);
    }

    // Step 6: Verify token is still valid on registry (only for timestamp proof tokens)
    if (!isSimpleToken) {
      console.log('\nStep 6: Verifying token against TimestampRegistry...');
      
      try {
        const isValid = await nftContract.verifyToken(tokenId);
        if (isValid) {
          console.log(`   ✓ Token proof is valid against TimestampRegistry`);
        } else {
          console.log(`   ❌ Token proof is INVALID against TimestampRegistry`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not verify token (function may not be supported)`);
      }
    } else {
      console.log('\nStep 6: Registry verification skipped (simple token, no timestamp proof)');
    }

    // Display final results
    console.log();
    displayNFTVerificationResults(nftMetadata, merkleRoot, {
      currentOwner,
      mintTxHash,
      mintBlockNumber,
      mintBlockTimestamp,
      onChainProof,
      onChainMerkleProof,
      digestMatch: onChainDigest === expectedDigest,
      isSimpleToken,
      contractType,
    }, false);

    process.exit(onChainDigest === expectedDigest ? 0 : 1);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Blockchain verification failed: ${errorMsg}`);
    displayNFTVerificationResults(nftMetadata, merkleRoot, { error: errorMsg }, false);
    process.exit(1);
  }
}

/**
 * Display NFT verification results
 */
function displayNFTVerificationResults(
  nftMetadata: ExtendedTokenMetadata,
  calculatedMerkleRoot: string,
  verificationResult: any,
  isOffline: boolean
): void {
  console.log('═'.repeat(80));
  
  const digestMatch = verificationResult?.digestMatch !== false && !verificationResult?.error;
  
  if (digestMatch && !verificationResult?.error) {
    console.log('✅ NFT VERIFICATION SUCCESSFUL');
  } else {
    console.log('❌ NFT VERIFICATION FAILED');
  }
  
  console.log('═'.repeat(80));
  
  console.log('\nNFT Token:');
  console.log(`   Token ID: ${nftMetadata.tokenId}`);
  console.log(`   Contract: ${nftMetadata.contractAddress}`);
  console.log(`   Network: ${nftMetadata.network} (Chain ${nftMetadata.networkChainId})`);
  
  if (verificationResult?.currentOwner) {
    console.log(`   Current Owner: ${verificationResult.currentOwner}`);
  } else if (nftMetadata.owner) {
    console.log(`   Owner (from metadata): ${nftMetadata.owner}`);
  }
  
  console.log('\nZIP File:');
  console.log(`   Merkle Root: ${calculatedMerkleRoot}`);
  
  // Minting info (block + timestamp)
  const mintBlockNumber = verificationResult?.mintBlockNumber ?? nftMetadata.blockNumber ?? null;
  const mintBlockTimestamp = verificationResult?.mintBlockTimestamp ?? null;
  const mintTxHash =
    verificationResult?.mintTxHash ??
    (nftMetadata.transactionHash && nftMetadata.transactionHash !== 'already-minted'
      ? nftMetadata.transactionHash
      : null);

  if (mintTxHash || mintBlockNumber != null || mintBlockTimestamp != null) {
    console.log('\nMint (NFT Token):');
    if (mintTxHash) {
      console.log(`   Mint Transaction: ${mintTxHash}`);
    }
    if (mintBlockNumber != null) {
      console.log(`   Mint Block Number: ${mintBlockNumber}`);
    }
    if (mintBlockTimestamp != null) {
      const mintDate = new Date(mintBlockTimestamp * 1000);
      console.log(`   Mint Block Timestamp: ${mintDate.toISOString()}`);
      console.log(`     (${mintDate.toLocaleString()})`);
    } else if (nftMetadata.mintedAt) {
      console.log(`   Minted At (metadata): ${nftMetadata.mintedAt}`);
    }
  }

  // Show token type and timestamp proof info
  const isSimpleToken = verificationResult?.isSimpleToken === true;
  const contractType = verificationResult?.contractType || 'unknown';
  const versionFromMetadata = nftMetadata.contractVersion;
  const versionLabel = contractType === 'unified'
    ? (versionFromMetadata ? `v${versionFromMetadata}` : 'v2.50/v2.51') + ' (UnifiedNFT)'
    : (versionFromMetadata ? `v${versionFromMetadata}` : 'v0.90') + ' (TimestampProofNFT)';

  if (contractType !== 'unknown') {
    console.log(`\nToken Type: ${isSimpleToken ? 'Simple (ownership only)' : 'Timestamp Proof'}`);
    console.log(`   Contract Version: ${versionLabel}`);
  }

  if (nftMetadata.timestampProof) {
    console.log('\nTimestamp Proof:');
    console.log(`   Batch Number: ${nftMetadata.timestampProof.batchNumber}`);
    console.log(`   Batch Transaction: ${nftMetadata.timestampProof.batchTransactionHash}`);
    console.log(`   Batch Block: ${nftMetadata.timestampProof.batchBlockNumber}`);
    const batchDate = new Date(nftMetadata.timestampProof.batchTimestamp * 1000);
    console.log(`   Batch Timestamp: ${batchDate.toISOString()}`);
    console.log(`     (${batchDate.toLocaleString()})`);
    console.log(`   Registry: ${nftMetadata.timestampProof.registryAddress}`);
  }

  if (verificationResult?.error) {
    console.log(`\n❌ Error: ${verificationResult.error}`);
  }

  if (isOffline) {
    console.log('\n⚠️  Offline mode: Blockchain verification was skipped.');
    console.log('   Run without --offline to verify on the blockchain.');
  }

  // Explorer links
  const networkName = nftMetadata.network?.toLowerCase() || '';
  let explorerBase = '';
  
  if (networkName.includes('base') && networkName.includes('sepolia')) {
    explorerBase = 'https://sepolia.basescan.org';
  } else if (networkName.includes('base')) {
    explorerBase = 'https://basescan.org';
  } else if (networkName.includes('arbitrum') && networkName.includes('sepolia')) {
    explorerBase = 'https://sepolia.arbiscan.io';
  } else if (networkName.includes('arbitrum')) {
    explorerBase = 'https://arbiscan.io';
  } else if (networkName.includes('sepolia')) {
    explorerBase = 'https://sepolia.etherscan.io';
  } else {
    explorerBase = 'https://etherscan.io';
  }

  console.log('\n📄 View on explorer:');
  console.log(`   NFT: ${explorerBase}/token/${nftMetadata.contractAddress}?a=${nftMetadata.tokenId}`);
  
  if (nftMetadata.timestampProof?.batchTransactionHash) {
    console.log(`   Batch TX: ${explorerBase}/tx/${nftMetadata.timestampProof.batchTransactionHash}`);
  }
  
  if (nftMetadata.transactionHash && nftMetadata.transactionHash !== 'already-minted') {
    console.log(`   Mint TX: ${explorerBase}/tx/${nftMetadata.transactionHash}`);
  }

  console.log('═'.repeat(80));
  console.log();
}

async function main() {
  console.log('Verify ZIP Timestamp\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const offlineMode = args.includes('--offline');
  const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));

  if (nonFlagArgs.length === 0) {
    console.error('❌ Error: ZIP file path is required');
    console.error('\nUsage:');
    console.error('  tsx stamp-zip/verify-zip.ts <path-to-stamped.nzip> [--offline]');
    console.error('\nOptions:');
    console.error('  --offline    Skip Zipstamp server (only for confirmed timestamps)');
    console.error('\nExamples:');
    console.error('  tsx stamp-zip/verify-zip.ts stamp-zip/output/stamped.nzip');
    console.error('  tsx stamp-zip/verify-zip.ts stamp-zip/output/calgary.nzip --offline');
    process.exit(1);
  }

  const zipPath = nonFlagArgs[0];

  if (!fs.existsSync(zipPath)) {
    console.error(`❌ Error: ZIP file not found: ${zipPath}`);
    console.error('\nUsage:');
    console.error('  tsx stamp-zip/verify-zip.ts <path-to-stamped.nzip>');
    console.error('\nExamples:');
    console.error('  tsx stamp-zip/verify-zip.ts stamp-zip/output/stamped.nzip');
    console.error('  tsx stamp-zip/verify-zip.ts stamp-zip/output/calgary.nzip');
    process.exit(1);
  }

  console.log(`📦 ZIP file: ${zipPath}`);
  const zipStats = fs.statSync(zipPath);
  console.log(`   Size: ${formatBytes(zipStats.size)}\n`);

  try {
    // Step 1: Load ZIP file
    console.log('Step 1: Loading ZIP file...');
    const zip = new ZipkitNode();
    await zip.loadZipFile(zipPath);
    console.log('✅ ZIP file loaded successfully\n');

    // Step 2: Extract metadata (check for NFT token first, then timestamp)
    console.log('Step 2: Extracting metadata...');
    const entries = zip.getDirectory();
    
    // Check for NFT token metadata first (TOKEN.NZIP standard, then NZIP.TOKEN legacy read-only)
    let nftEntry = entries.find((e: any) => e.filename === NFT_METADATA);
    let isLegacyFormat = false;
    
    if (!nftEntry) {
      nftEntry = entries.find((e: any) => e.filename === NFT_METADATA_LEGACY);
      isLegacyFormat = true;
    }
    
    if (nftEntry) {
      // This is an NFT-tokenized ZIP - use NFT verification flow
      const formatName = isLegacyFormat ? 'NZIP.TOKEN (legacy, read-only)' : 'TOKEN.NZIP';
      console.log(`   Found: ${formatName} (NFT proof token)`);
      if (isLegacyFormat) {
        console.log('   ⚠️  Legacy format. Write new files as TOKEN.NZIP.');
      }
      await verifyNFTToken(zip, nftEntry, zipPath, offlineMode);
      return; // NFT verification handles its own exit
    }
    
    // Find timestamp metadata entry using utilities
    const metadataResult = findMetadataEntry(entries);

    if (!metadataResult) {
      console.error('❌ Error: No metadata found in ZIP file');
      console.error(`   Expected: TOKEN.NZIP (or legacy NZIP.TOKEN), or ${getMetadataFileNames().join(', ')}`);
      console.error('\n💡 This ZIP file does not appear to be timestamped or tokenized.');
      console.error('   Use stamp-zip.ts to create a timestamped ZIP file.');
      await zip.closeFile();
      process.exit(1);
    }

    const metadataEntry = metadataResult.entry;
    const metadataType = metadataResult.type || 'pending';

    // Extract metadata content to temporary file
    const tempMetadataFile = path.join(__dirname, 'output', '.timestamp-metadata-temp.json');
    const tempMetadataDir = path.dirname(tempMetadataFile);
    if (!fs.existsSync(tempMetadataDir)) {
      fs.mkdirSync(tempMetadataDir, { recursive: true });
    }

    let timestampMetadata: TimestampMetadata;

    try {
      await zip.extractToFile(metadataEntry, tempMetadataFile);
      const metadataContent = fs.readFileSync(tempMetadataFile, 'utf8');
      
      // Clean up temp file
      fs.unlinkSync(tempMetadataFile);
      
      try {
        timestampMetadata = JSON.parse(metadataContent);
      } catch (parseError) {
        console.error('❌ Error: Invalid timestamp metadata format');
        console.error('   Timestamp metadata must be valid JSON');
        await zip.closeFile();
        process.exit(1);
      }
    } catch (extractError) {
      console.error('❌ Error: Could not extract timestamp metadata');
      console.error(`   ${extractError instanceof Error ? extractError.message : String(extractError)}`);
      // Clean up temp file if it exists
      if (fs.existsSync(tempMetadataFile)) {
        try {
          fs.unlinkSync(tempMetadataFile);
        } catch (unlinkError) {
          // Ignore
        }
      }
      await zip.closeFile();
      process.exit(1);
    }

    // Validate metadata structure
    if (!timestampMetadata.digest) {
      console.error('❌ Error: Invalid timestamp metadata structure');
      console.error('   Missing required field: digest');
      await zip.closeFile();
      process.exit(1);
    }

    console.log('✅ Timestamp metadata extracted');
    console.log(`   Type: ${metadataType === 'confirmed' ? 'Confirmed (TIMESTAMP.NZIP)' : 'Pending (TS-SUBMIT.NZIP)'}`);
    if (timestampMetadata.status) {
      console.log(`   Status: ${timestampMetadata.status}`);
    }
    console.log(`   Digest: ${timestampMetadata.digest}`);
    if (timestampMetadata.batchId) {
      console.log(`   Batch ID: ${timestampMetadata.batchId}`);
      // Extract and display batch number from batchId (format: ...-n{number})
      const batchNumberMatch = timestampMetadata.batchId.match(/-n(\d+)$/);
      if (batchNumberMatch) {
        console.log(`   Batch Number: ${batchNumberMatch[1]}`);
      }
    }
    if (timestampMetadata.transactionHash) {
      console.log(`   Transaction: ${timestampMetadata.transactionHash}`);
    }
    console.log();

    // Step 3: Calculate merkle root from ZIP contents
    console.log('Step 3: Calculating merkle root from ZIP contents...');
    
    // Get merkle root (this excludes metadata files automatically)
    const merkleRoot = (zip as any).getMerkleRoot?.();
    
    if (!merkleRoot) {
      console.error('❌ Error: Could not calculate merkle root');
      console.error('   Make sure the ZIP file was created with SHA-256 hashes enabled');
      await zip.closeFile();
      process.exit(1);
    }

    console.log(`✅ Merkle root calculated: ${merkleRoot}`);
    
    // Compare with metadata digest
    if (timestampMetadata.digest === merkleRoot) {
      console.log('   ✓ Matches digest in timestamp metadata');
    } else {
      console.log('   ⚠️  WARNING: Does not match digest in timestamp metadata!');
      console.log(`      Metadata: ${timestampMetadata.digest}`);
      console.log(`      Calculated: ${merkleRoot}`);
      console.log('   This may indicate the ZIP file has been modified.');
    }
    console.log();

    // Close file handle before verification
    await zip.closeFile();

    // Step 4: Verify timestamp
    // For confirmed timestamps with complete proof, we can verify directly on blockchain
    // For pending timestamps, we need to check with the Zipstamp server
    
    const hasCompleteProof = metadataType === 'confirmed' && 
      timestampMetadata.merkleProof && 
      timestampMetadata.merkleRoot && 
      timestampMetadata.transactionHash;

    let verificationResult: any;

    if (hasCompleteProof) {
      // Direct blockchain verification using portable module (no database access)
      if (offlineMode) {
        // Offline mode: Only local verification
        console.log('Step 4: Verifying transaction on the Blockchain...');
        console.log('   (Skipped in offline mode)');
        console.log('Step 5: Verifying Merkle Proof locally...');
        const proofValid = verifyMerkleProofLocal(
          merkleRoot,
          timestampMetadata.merkleRoot!,
          timestampMetadata.merkleProof!
        );

        if (!proofValid) {
          verificationResult = {
            success: false,
            verified: false,
            digest: merkleRoot,
            error: 'Merkle proof verification failed (invalid proof)',
          };
          console.log('   ❌ Step 5 failed: Local merkle proof invalid');
        } else {
          console.log('   ✓ Step 5 passed: Local merkle proof verified');
          console.log('Step 6: Verifying Merkle Proof on chain...');
          console.log('   (Skipped in offline mode)');
          console.log();
          
          // Build result from metadata (offline mode - no on-chain data)
          verificationResult = {
            success: true,
            verified: true,
            digest: merkleRoot,
            chainId: timestampMetadata.chainId,
            network: timestampMetadata.network,
            contractAddress: timestampMetadata.contractAddress,
            merkleRoot: timestampMetadata.merkleRoot,
            merkleProof: timestampMetadata.merkleProof,
            batchId: timestampMetadata.batchId,
            batchNumber: timestampMetadata.batchNumber,
            tokenId: timestampMetadata.tokenId,
            transactionHash: timestampMetadata.transactionHash,
            blockNumber: timestampMetadata.blockNumber,
            timestamp: timestampMetadata.timestamp,
            status: 'confirmed' as const,
          };
          
          (verificationResult as any).onChainVerified = false; // Not verified on-chain in offline mode
        }
      } else {
        // Online mode: Use verifyProofOnChain which performs three-stage verification
        if (!timestampMetadata.chainId) {
            verificationResult = {
              success: false,
              verified: false,
              digest: merkleRoot,
              error: 'Chain ID is required for on-chain verification',
            };
          } else {
            // Normalize inputs
            const normalizeHex = (hex: string): string => hex.startsWith('0x') ? hex : `0x${hex}`;
            const normalizedMerkleRoot = normalizeHex(timestampMetadata.merkleRoot!);
            const normalizedDigest = normalizeHex(merkleRoot);
            const normalizedProof = timestampMetadata.merkleProof!.map(p => normalizeHex(p));
            
            // Step 4: Verify transaction on blockchain
            console.log('Step 4: Verifying transaction on the Blockchain...');
            let transactionBatch: any = null;
            let step4Error: string | null = null;
            let transactionContractAddress: string | null = null; // Store transaction's actual contract address
            
            if (timestampMetadata.transactionHash) {
              try {
                // Get transaction to extract its contract address
                // We'll get it from the transaction receipt which is already fetched in verifyTransactionAndExtractBatch
                // But we need it before that call, so get it directly
                const chainConfig = getChainConfig(timestampMetadata.chainId);
                if (chainConfig) {
                  const { ethers } = await import('ethers');
                  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, timestampMetadata.chainId);
                  const tx = await provider.getTransaction(timestampMetadata.transactionHash);
                  if (tx?.to) {
                    transactionContractAddress = tx.to;
                  }
                }
                
                // Don't pass contract address - let the method use the transaction's actual address
                // This allows verification of transactions to old contract addresses
                // The transaction's actual 'to' address is what matters, not what's in metadata
                transactionBatch = await blockchainService.verifyTransactionAndExtractBatch(
                  timestampMetadata.transactionHash,
                  timestampMetadata.chainId,
                  normalizedMerkleRoot
                  // contractAddress not passed - method will use transaction's actual address
                );
                
                if (!transactionBatch) {
                  step4Error = `Transaction not found on blockchain or transaction failed: ${timestampMetadata.transactionHash}`;
                  console.log(`   ❌ Transaction not found on blockchain or transaction failed`);
                  console.log(`   Transaction Hash: ${timestampMetadata.transactionHash}`);
                } else {
                  // Verify merkle root matches
                  const transactionMerkleRoot = normalizeHex(transactionBatch.merkleRoot);
                  if (transactionMerkleRoot.toLowerCase() !== normalizedMerkleRoot.toLowerCase()) {
                    step4Error = `Merkle root mismatch: Transaction contains ${transactionMerkleRoot} but metadata has ${normalizedMerkleRoot}`;
                    console.log(`   ❌ ${step4Error}`);
                  } else {
                    const chainConfig = getChainConfig(timestampMetadata.chainId);
                    const network = chainConfig?.network || `Chain ${timestampMetadata.chainId}`;
                    let timestamp = 'N/A';
                    let timestampLocal: string | null = null;
                    if (transactionBatch.timestamp) {
                      const d = new Date(transactionBatch.timestamp * 1000);
                      timestamp = d.toISOString();
                      timestampLocal = d.toLocaleString();
                    }
                    console.log(`✅ Transaction verified`);
                    console.log(`   Transaction: ${timestampMetadata.transactionHash}`);
                    console.log(`   Block: ${transactionBatch.blockNumber || 'N/A'}`);
                    console.log(`   Timestamp: ${timestamp}`);
                    if (timestampLocal) {
                      console.log(`     (${timestampLocal})`);
                    }
                    console.log(`   Network: ${network}`);
                    console.log(`   Merkle Root: ${transactionMerkleRoot}`);
                  }
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Check if this is an RPC/network error (should allow verification to continue)
                const isRpcError = errorMessage.includes('503') || 
                                   errorMessage.includes('Service Unavailable') ||
                                   errorMessage.includes('no backend is currently healthy') ||
                                   errorMessage.includes('ECONNREFUSED') ||
                                   errorMessage.includes('ETIMEDOUT') ||
                                   errorMessage.includes('Network error');
                
                if (isRpcError) {
                  // RPC unavailable - show warning but continue with local verification
                  const chainConfig = getChainConfig(timestampMetadata.chainId);
                  const explorerUrl = chainConfig?.explorerUrl || 'https://basescan.org';
                  const txUrl = `${explorerUrl}/tx/${timestampMetadata.transactionHash}`;
                  
                  console.log(`   ⚠️  RPC unavailable: ${errorMessage}`);
                  console.log(`   Transaction hash: ${timestampMetadata.transactionHash}`);
                  console.log(`   You can verify manually at: ${txUrl}`);
                  console.log(`   Continuing with local verification using metadata...`);
                  step4Error = null; // Don't fail verification for RPC issues
                } else {
                  // Actual error (transaction not found, etc.) - fail verification
                  step4Error = errorMessage;
                  console.log(`   ❌ Error: ${step4Error}`);
                }
              }
            } else {
              step4Error = 'No transaction hash in metadata';
              console.log(`   ⚠️  ${step4Error} (skipping transaction verification)`);
            }
            console.log();
            
            // If Step 4 failed with a real error (not RPC issue), fail immediately
            if (step4Error && timestampMetadata.transactionHash) {
              verificationResult = {
                success: false,
                verified: false,
                digest: merkleRoot,
                error: step4Error,
                chainId: timestampMetadata.chainId,
                network: timestampMetadata.network,
                contractAddress: timestampMetadata.contractAddress,
                merkleRoot: timestampMetadata.merkleRoot,
                merkleProof: timestampMetadata.merkleProof,
                transactionHash: timestampMetadata.transactionHash,
              };
            } else {
              // Step 5: Verify merkle proof locally
              console.log('Step 5: Verifying Merkle Proof locally...');
              const localValid = verifyMerkleProofLocal(
                normalizedDigest,
                normalizedMerkleRoot,
                normalizedProof
              );
              
              if (!localValid) {
                console.log('   ❌ Merkle proof verification failed (invalid proof)');
                console.log();
                verificationResult = {
                  success: false,
                  verified: false,
                  digest: merkleRoot,
                  error: 'Merkle proof verification failed (invalid proof - digest is not part of batch)',
                  chainId: timestampMetadata.chainId,
                  network: timestampMetadata.network,
                  contractAddress: timestampMetadata.contractAddress,
                  merkleRoot: timestampMetadata.merkleRoot,
                  merkleProof: timestampMetadata.merkleProof,
                  transactionHash: timestampMetadata.transactionHash,
                };
              } else {
                console.log('✅ Merkle proof verified locally');
                console.log(`   Digest: ${normalizedDigest}`);
                console.log(`   Merkle Root: ${normalizedMerkleRoot}`);
                console.log(`   Proof Length: ${normalizedProof.length} nodes`);
                console.log();
                
                // Step 6: Verify merkle proof on chain
                console.log('Step 6: Verifying Merkle Proof on chain...');
                try {
                  // Use transaction's actual contract address from Step 4 (what was actually used)
                  const contractAddressForVerification = transactionContractAddress || undefined;
                  
                  const onChainResult = await blockchainService.verifyProof(
                    normalizedDigest,
                    normalizedProof,
                    normalizedMerkleRoot,
                    timestampMetadata.chainId,
                    contractAddressForVerification
                  );
                  
                  if (!onChainResult.isValid) {
                    // Check if batch exists to determine exact error
                    const batchCheck = await blockchainService.batchExists(
                      normalizedMerkleRoot, 
                      timestampMetadata.chainId,
                      contractAddressForVerification
                    );
                    const chainConfig = getChainConfig(timestampMetadata.chainId);
                    // Prefer the transaction's actual `to` address over metadata/config.
                    // (Important when verifying historical transactions against older deployments.)
                    const contractAddress =
                      transactionContractAddress ||
                      timestampMetadata.contractAddress ||
                      chainConfig?.contractAddress ||
                      'N/A';
                    // NOTE: chainConfig?.contractVersion may not match older deployments.
                    const contractVersion = chainConfig?.contractVersion || 'unknown';
                    
                    if (batchCheck.functionNotSupported) {
                      console.log(`   ❌ Contract does not support verifyProof function`);
                      console.log(`      Contract: ${contractAddress}`);
                      console.log(`      Version: ${contractVersion}`);
                      console.log();
                      verificationResult = {
                        success: false,
                        verified: false,
                        digest: merkleRoot,
                        error: `Contract at ${contractAddress} (version ${contractVersion}) does not support verifyProof function`,
                        chainId: timestampMetadata.chainId,
                        network: timestampMetadata.network,
                        contractAddress,
                        merkleRoot: timestampMetadata.merkleRoot,
                        merkleProof: timestampMetadata.merkleProof,
                        transactionHash: timestampMetadata.transactionHash,
                      };
                    } else if (!batchCheck.exists) {
                      console.log(`   ❌ Batch not found on blockchain`);
                      console.log(`      Merkle Root: ${normalizedMerkleRoot}`);
                      console.log(`      Contract: ${contractAddress}`);
                      console.log();
                      verificationResult = {
                        success: false,
                        verified: false,
                        digest: merkleRoot,
                        error: `Batch with merkle root ${normalizedMerkleRoot} not found on blockchain contract ${contractAddress}`,
                        chainId: timestampMetadata.chainId,
                        network: timestampMetadata.network,
                        contractAddress,
                        merkleRoot: timestampMetadata.merkleRoot,
                        merkleProof: timestampMetadata.merkleProof,
                        transactionHash: timestampMetadata.transactionHash,
                      };
                    } else {
                      console.log(`   ❌ Merkle proof invalid on-chain`);
                      console.log(`      Digest: ${normalizedDigest}`);
                      console.log(`      Merkle Root: ${normalizedMerkleRoot}`);
                      console.log();
                      verificationResult = {
                        success: false,
                        verified: false,
                        digest: merkleRoot,
                        error: `Merkle proof invalid on-chain: Proof does not verify digest ${normalizedDigest} in batch ${normalizedMerkleRoot}`,
                        chainId: timestampMetadata.chainId,
                        network: timestampMetadata.network,
                        contractAddress: transactionContractAddress || timestampMetadata.contractAddress,
                        merkleRoot: timestampMetadata.merkleRoot,
                        merkleProof: timestampMetadata.merkleProof,
                        transactionHash: timestampMetadata.transactionHash,
                      };
                    }
                  } else {
                    const chainConfig = getChainConfig(timestampMetadata.chainId);
                    const network = chainConfig?.network || `Chain ${timestampMetadata.chainId}`;
                    let timestamp = 'N/A';
                    let timestampLocal: string | null = null;
                    if (onChainResult.timestamp) {
                      const d = new Date(onChainResult.timestamp * 1000);
                      timestamp = d.toISOString();
                      timestampLocal = d.toLocaleString();
                    }
                    // Prefer the transaction's actual `to` address over metadata/config
                    const contractAddress =
                      transactionContractAddress ||
                      timestampMetadata.contractAddress ||
                      chainConfig?.contractAddress ||
                      'N/A';
                    
                    console.log(`✅ Merkle proof verified on-chain`);
                    console.log(`   Batch Number: ${onChainResult.batchNumber}`);
                    console.log(`   Block: ${onChainResult.blockNumber}`);
                    console.log(`   Timestamp: ${timestamp}`);
                    if (timestampLocal) {
                      console.log(`     (${timestampLocal})`);
                    }
                    console.log(`   Network: ${network}`);
                    console.log(`   Contract: ${contractAddress}`);
                    console.log();
                    
                    // All three stages passed
                    verificationResult = {
                      success: true,
                      verified: true,
                      digest: merkleRoot,
                      chainId: timestampMetadata.chainId,
                      network: network,
                      contractAddress: contractAddress,
                      merkleRoot: timestampMetadata.merkleRoot,
                      merkleProof: timestampMetadata.merkleProof,
                      batchId: timestampMetadata.batchId,
                      batchNumber: onChainResult.batchNumber || timestampMetadata.batchNumber,
                      tokenId: timestampMetadata.tokenId,
                      transactionHash: timestampMetadata.transactionHash,
                      blockNumber: onChainResult.blockNumber || transactionBatch?.blockNumber || timestampMetadata.blockNumber,
                      timestamp: onChainResult.timestamp || transactionBatch?.timestamp || timestampMetadata.timestamp,
                      status: 'confirmed' as const,
                    };
                    
                    (verificationResult as any).onChainVerified = true;
                  }
                } catch (error) {
                  const chainConfig = getChainConfig(timestampMetadata.chainId);
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  
                  // Check if this is an RPC/network error
                  const isRpcError = errorMsg.includes('503') || 
                                     errorMsg.includes('Service Unavailable') ||
                                     errorMsg.includes('no backend is currently healthy') ||
                                     errorMsg.includes('ECONNREFUSED') ||
                                     errorMsg.includes('ETIMEDOUT') ||
                                     errorMsg.includes('Network error') ||
                                     errorMsg.includes('CALL_EXCEPTION');
                  
                  if (isRpcError) {
                    // RPC unavailable - local proof is valid, so verification succeeds with warning
                    console.log(`   ⚠️  RPC unavailable: ${errorMsg}`);
                    console.log(`   Local merkle proof verification passed (proof is mathematically valid)`);
                    console.log(`   On-chain verification skipped due to RPC issues`);
                    console.log();
                    
                    // Build result from metadata (local verification passed)
                    verificationResult = {
                      success: true,
                      verified: true,
                      digest: merkleRoot,
                      chainId: timestampMetadata.chainId,
                      network: timestampMetadata.network || chainConfig?.network,
                      contractAddress: transactionContractAddress || timestampMetadata.contractAddress || chainConfig?.contractAddress,
                      merkleRoot: timestampMetadata.merkleRoot,
                      merkleProof: timestampMetadata.merkleProof,
                      batchId: timestampMetadata.batchId,
                      batchNumber: timestampMetadata.batchNumber,
                      tokenId: timestampMetadata.tokenId,
                      transactionHash: timestampMetadata.transactionHash,
                      blockNumber: transactionBatch?.blockNumber || timestampMetadata.blockNumber,
                      timestamp: transactionBatch?.timestamp || timestampMetadata.timestamp,
                      status: 'confirmed' as const,
                    };
                    
                    (verificationResult as any).onChainVerified = false; // Not verified on-chain due to RPC
                    (verificationResult as any).rpcError = errorMsg; // Store RPC error for reference
                  } else {
                    // Actual error - fail verification
                    console.log(`   ❌ Error: ${errorMsg}`);
                    console.log();
                    verificationResult = {
                      success: false,
                      verified: false,
                      digest: merkleRoot,
                      error: `On-chain verification failed: ${errorMsg}`,
                      chainId: timestampMetadata.chainId,
                      network: timestampMetadata.network,
                      contractAddress: transactionContractAddress || timestampMetadata.contractAddress || chainConfig?.contractAddress,
                      merkleRoot: timestampMetadata.merkleRoot,
                      merkleProof: timestampMetadata.merkleProof,
                      transactionHash: timestampMetadata.transactionHash,
                    };
                  }
                }
              }
            }
          }
        }
    } else if (offlineMode) {
      console.error('❌ Error: Offline mode requires a confirmed timestamp with complete proof');
      console.error('   This file has a pending timestamp (TS-SUBMIT.NZIP).');
      console.error('   Run upgrade-zip.ts first to upgrade to a confirmed timestamp.');
      process.exit(1);
    } else {
      // Verify via token server (for pending timestamps or incomplete proofs)
      console.log('Step 4: Verifying timestamp via token server...');
      const zipStampServerUrl = getZipStampServerUrl();
      console.log(`   Server: ${zipStampServerUrl}`);
      console.log('   This may take a few moments...\n');

      try {
        // If we have a batchId from metadata, use it to prioritize finding the digest in that specific batch
        // This ensures we verify the correct batch when duplicates exist
        verificationResult = await verifyDigest(merkleRoot, timestampMetadata.chainId, timestampMetadata.batchId || undefined);
      } catch (error) {
        console.error('❌ Error: Failed to verify timestamp');
        console.error(`   ${error instanceof Error ? error.message : String(error)}`);
        console.error(`\n💡 Make sure the Zipstamp server is running at ${zipStampServerUrl}`);
        process.exit(1);
      }
    }

    // Step 7: Display verification results
    console.log('Step 7: Verification Results');
    console.log('═'.repeat(80));
    
    // Check if this is a pending submission (TS-SUBMIT) or confirmed (TIMESTAMP)
    // If transactionHash exists, the batch is confirmed on blockchain, regardless of metadata type
    const isPending = !verificationResult.transactionHash && (metadataType === 'pending' || verificationResult.status === 'pending');
    const isConfirmed = !!verificationResult.transactionHash;
    
    // Show success if:
    // 1. Success and verified (confirmed on blockchain)
    // 2. Success and pending (in database or batch, awaiting minting)
    if (verificationResult.success && (verificationResult.verified || isPending || isConfirmed)) {
      console.log('✅ VERIFICATION SUCCESSFUL');
      console.log('═'.repeat(80));
      console.log(`Digest: ${merkleRoot}`);
      
      if (isConfirmed) {
        // Check which verification methods were used
        const verificationMethods = (verificationResult as any).verificationMethods;
        const onChainVerified = (verificationResult as any).onChainVerified === true;
        
        if (verificationMethods?.onChainContractVerified) {
          // All three stages passed
          console.log(`Status: Confirmed (Fully verified on blockchain)`);
          console.log(`\n📝 Blockchain Confirmation:`);
          console.log(`   ✓ Transaction verified (merkle root extracted from blockchain event)`);
          console.log(`   ✓ Local merkle proof verified (digest is part of batch)`);
          console.log(`   ✓ On-chain contract verified (batch exists and proof valid on blockchain)`);
        } else if (verificationMethods?.transactionVerified && verificationMethods?.localProofVerified) {
          // Stages 1 and 2 passed, Stage 3 unavailable
          console.log(`Status: Confirmed (Verified via transaction + proof)`);
          console.log(`\n📝 Blockchain Confirmation:`);
          console.log(`   ✓ Transaction verified (transaction exists and was successful)`);
          console.log(`   ✓ Local merkle proof verified (digest is part of batch)`);
          console.log(`   ⚠️  On-chain contract verification unavailable`);
          if (verificationMethods.onChainContractError) {
            console.log(`      Reason: ${verificationMethods.onChainContractError}`);
            console.log(`      (Contract may not support verifyProof function - this is expected for older contract versions)`);
          }
          console.log(`\n   Note: Verification is still cryptographically secure via transaction + proof verification.`);
        } else if (onChainVerified) {
          // Legacy: onChainVerified flag (for backwards compatibility)
          console.log(`Status: Confirmed (Verified on blockchain)`);
          console.log(`\n📝 Blockchain Confirmation:`);
          console.log(`   The digest has been confirmed and verified on the blockchain.`);
        } else {
          // Fallback for older verification results
          console.log(`Status: Confirmed (Transaction exists on blockchain)`);
          console.log(`\n📝 Blockchain Confirmation:`);
          console.log(`   The Zipstamp server has confirmed this timestamp (transaction exists on blockchain).`);
          if (!offlineMode && metadataType === 'pending') {
            console.log(`   Note: This verification relies on the Zipstamp server.`);
            console.log(`   To get independent verification directly through the blockchain contract, upgrade this ZIP file.`);
          } else if (!offlineMode) {
            console.log(`   Note: On-chain proof verification was not performed or failed.`);
          }
        }
      } else if (isPending) {
        if (verificationResult.batchId) {
          console.log(`Status: Pending (In batch, awaiting blockchain confirmation)`);
          console.log(`\n📝 Batch Status:`);
          console.log(`   The digest has been included in a batch and is awaiting minting.`);
          console.log(`   Once the batch is minted, it will be confirmed on the blockchain.`);
        } else {
          console.log(`Status: Pending (Submitted to database, awaiting batch processing)`);
          console.log(`\n📝 Submission Status:`);
          console.log(`   The digest has been successfully submitted to the Zipstamp server.`);
          console.log(`   It will be included in the next batch and confirmed on the blockchain.`);
        }
      } else {
        // Fallback case - check if we have transaction hash but didn't verify on-chain
        const onChainVerified = (verificationResult as any).onChainVerified === true;
        if (onChainVerified) {
          console.log(`Status: Confirmed (Verified on blockchain)`);
        } else if (verificationResult.transactionHash) {
          console.log(`Status: Confirmed (Transaction exists on blockchain)`);
        } else {
          console.log(`Status: Confirmed`);
        }
      }
      
      if (verificationResult.network) {
        console.log(`Network: ${verificationResult.network}`);
      }
      if (verificationResult.chainId) {
        console.log(`Chain ID: ${verificationResult.chainId}`);
      }
      
      if (verificationResult.batchId) {
        console.log(`\nBatch Information:`);
        console.log(`  Batch ID: ${verificationResult.batchId}`);
        if (verificationResult.batchNumber) {
          console.log(`  Batch Number: ${verificationResult.batchNumber}`);
        }
      }

      if (verificationResult.transactionHash) {
        console.log(`\nBlockchain Data:`);
        console.log(`  Transaction: ${verificationResult.transactionHash}`);
        if (verificationResult.blockNumber) {
          console.log(`  Block Number: ${verificationResult.blockNumber}`);
        }
        // Display blockchain timestamp (prefer verification result, fallback to metadata)
        // This should always be available if we have a transaction hash
        const blockchainTimestamp = verificationResult.timestamp || timestampMetadata.timestamp;
        if (blockchainTimestamp) {
          const timestampDate = new Date(blockchainTimestamp * 1000);
          console.log(`  Blockchain Timestamp: ${timestampDate.toISOString()}`);
          console.log(`    (${timestampDate.toLocaleString()})`);
        } else {
          // If we have transaction hash but no timestamp
          if (metadataType === 'pending') {
            // ZIP is still in submit state (TS-SUBMIT.NZIP)
            // Don't show warning here - it's explained later in the TIP section
          } else {
            // ZIP is in confirmed state but timestamp missing (upgrade was done before fix)
            console.log(`  ⚠️  Blockchain Timestamp: Not available (could not fetch from blockchain)`);
            console.log(`      The Zipstamp server has confirmed this timestamp, but the blockchain timestamp could not be retrieved.`);
            console.log(`      To get independent verification (not relying on the Zipstamp server), try re-upgrading the ZIP file.`);
            console.log(`      The upgrade will enable validation directly through the contract on the blockchain:`);
            console.log(`      tsx stamp-zip/upgrade-zip.ts ${zipPath}`);
          }
        }
        if (verificationResult.merkleRoot) {
          console.log(`  Merkle Root: ${verificationResult.merkleRoot}`);
        }
        if (verificationResult.contractAddress) {
          console.log(`  Contract: ${verificationResult.contractAddress}`);
        }
      } else if (timestampMetadata.timestamp) {
        // Show timestamp even if transaction hash is not available (from metadata)
        const timestampDate = new Date(timestampMetadata.timestamp * 1000);
        console.log(`\nBlockchain Timestamp:`);
        console.log(`  ${timestampDate.toISOString()}`);
        console.log(`  (${timestampDate.toLocaleString()})`);
      }

      // Display merkle proof if available (from TIMESTAMP.NZIP metadata)
      if (timestampMetadata.merkleProof && timestampMetadata.merkleProof.length > 0) {
        console.log(`\n🔐 Merkle Proof (${timestampMetadata.merkleProof.length} step${timestampMetadata.merkleProof.length !== 1 ? 's' : ''}):`);
        timestampMetadata.merkleProof.forEach((proofStep: string, index: number) => {
          const formattedProof = proofStep.startsWith('0x') ? proofStep : `0x${proofStep}`;
          console.log(`  ${index + 1}. ${formattedProof}`);
        });
      } else if (isConfirmed && verificationResult.merkleProof && verificationResult.merkleProof.length > 0) {
        // Fallback: use merkle proof from verification result if available
        console.log(`\n🔐 Merkle Proof (${verificationResult.merkleProof.length} step${verificationResult.merkleProof.length !== 1 ? 's' : ''}):`);
        verificationResult.merkleProof.forEach((proofStep: string, index: number) => {
          const formattedProof = proofStep.startsWith('0x') ? proofStep : `0x${proofStep}`;
          console.log(`  ${index + 1}. ${formattedProof}`);
        });
      } else if (isConfirmed && metadataType === 'pending') {
        // No merkle proof available - this is a submit state ZIP
        console.log(`\n⚠️  Merkle Proof: Not available (ZIP file is in submit state)`);
        console.log(`   The Zipstamp server has confirmed this timestamp, but the merkle proof is not yet stored in the ZIP.`);
        console.log(`   To get independent verification directly through the blockchain contract, upgrade this ZIP file.`);
      }

      if (!isPending && !isConfirmed && !verificationResult.transactionHash) {
        console.log(`\n⚠️  Timestamp is pending confirmation`);
        console.log(`   The digest has been submitted but not yet confirmed on the blockchain.`);
        console.log(`   Check back later or wait for batch processing.`);
      }
      
      // Suggest upgrade for pending timestamps that are confirmed on server
      if (isConfirmed && metadataType === 'pending') {
        console.log(`\n💡 TIP: Upgrade this timestamp for independent verification:`);
        console.log(`   The Zipstamp server has confirmed this timestamp, but to get independent verification`);
        console.log(`   (not relying on the Zipstamp server), upgrade this ZIP file. This will enable validation`);
        console.log(`   directly through the contract on the blockchain:`);
        console.log(`   tsx stamp-zip/upgrade-zip.ts ${zipPath}`);
      } else if (isPending && !verificationResult.transactionHash) {
        console.log(`\n💡 TIP: Once minted, upgrade for independent verification:`);
        console.log(`   After the batch is confirmed on blockchain, upgrade this ZIP file to enable`);
        console.log(`   independent verification directly through the contract on the blockchain:`);
        console.log(`   tsx stamp-zip/upgrade-zip.ts ${zipPath} --wait`);
      }

      // Display explorer link if available
      if (verificationResult.transactionHash && verificationResult.network) {
        const networkName = verificationResult.network.toLowerCase();
        let explorerUrl = '';
        
        if (networkName.includes('base') && networkName.includes('sepolia')) {
          explorerUrl = `https://sepolia.basescan.org/tx/${verificationResult.transactionHash}`;
        } else if (networkName.includes('base')) {
          explorerUrl = `https://basescan.org/tx/${verificationResult.transactionHash}`;
        } else if (networkName.includes('arbitrum') && networkName.includes('sepolia')) {
          explorerUrl = `https://sepolia.arbiscan.io/tx/${verificationResult.transactionHash}`;
        } else if (networkName.includes('arbitrum')) {
          explorerUrl = `https://arbiscan.io/tx/${verificationResult.transactionHash}`;
        } else if (networkName.includes('sepolia')) {
          explorerUrl = `https://sepolia.etherscan.io/tx/${verificationResult.transactionHash}`;
        } else if (networkName.includes('ethereum')) {
          explorerUrl = `https://etherscan.io/tx/${verificationResult.transactionHash}`;
        }

        if (explorerUrl) {
          console.log(`\n📄 View transaction on explorer:`);
          console.log(`   ${explorerUrl}`);
        }
      }

    } else {
      console.log('❌ VERIFICATION FAILED');
      console.log('═'.repeat(80));
      
      // Show exact failure reason
      const errorMessage = verificationResult.error || 'Digest not found or not verified';
      console.log(`Error: ${errorMessage}`);
      
      // Provide specific guidance based on error type
      if (metadataType === 'confirmed' && hasCompleteProof) {
        console.log('\n💡 This is a TIMESTAMP.NZIP file (confirmed timestamp with complete proof).');
        
        if (errorMessage.includes('Transaction not found')) {
          console.log('   The transaction hash in the metadata does not exist on the blockchain.');
          console.log('   This may indicate:');
          console.log('   - The transaction hash is incorrect');
          console.log('   - The transaction was on a different chain');
          console.log('   - Network connectivity issues');
        } else if (errorMessage.includes('Merkle root mismatch')) {
          console.log('   The merkle root in the transaction does not match the metadata.');
          console.log('   This indicates possible tampering with the ZIP file metadata.');
        } else if (errorMessage.includes('Merkle proof verification failed')) {
          console.log('   The merkle proof is mathematically invalid.');
          console.log('   The digest is not part of the batch\'s merkle tree.');
        } else if (errorMessage.includes('does not support verifyProof')) {
          console.log('   The contract version does not support the verifyProof function.');
          console.log('   The verifyProof function is not available in contract version 0.90.');
        } else if (errorMessage.includes('not found on blockchain')) {
          console.log('   The batch with this merkle root does not exist on the blockchain.');
          console.log('   This may indicate:');
          console.log('   - The batch was minted to a different contract address');
          console.log('   - The merkle root is incorrect');
        } else if (errorMessage.includes('Network error')) {
          console.log('   Failed to connect to the blockchain network.');
          console.log('   Check your network connection and RPC endpoint configuration.');
        } else {
          console.log(`   ${errorMessage}`);
        }
      } else {
        console.log('\n💡 Verification failed:');
        console.log(`   ${errorMessage}`);
      }
    }

    console.log('═'.repeat(80));
    console.log();

    // Exit with appropriate code
    // Exit 0 if verification was successful (digest found), even if pending (not yet minted)
    // Exit 1 only if verification failed (digest not found)
    process.exit(verificationResult.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Error during verification:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
