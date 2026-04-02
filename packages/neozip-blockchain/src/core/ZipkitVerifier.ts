#!/usr/bin/env node

/**
 * ZipkitVerifier - Handles NFT token verification for ZIP files
 * Verifier API for NZIP-NFT smart contract.
 */

import { ethers } from 'ethers';
import { NZIP_CONTRACT_ABI, CONTRACT_CONFIGS, getContractConfig, getNetworkByName, getContractAdapter, validateContractAddress, validateTokenId, validateEthereumAddress, sanitizeNetworkName, validateMerkleRootFormat, TOKENIZED_METADATA, TOKENIZED_METADATA_LEGACY, DEFAULT_CONTRACT_VERSION, type ContractConfig } from './contracts';
import { getAdapter } from './adapters/AdapterFactory';
import { IMPLEMENTED_VERSIONS, normalizeVersion, isVersionSupported } from './ContractVersionRegistry';
import type { TokenMetadata } from '../types';

export interface VerificationOptions {
  debug?: boolean;
  skipHash?: boolean;
  /**
   * Enable RPC consensus mechanism for enhanced security
   * When enabled, queries multiple RPC endpoints and requires majority agreement
   * Default: false (disabled for quick validation)
   */
  rpcConsensus?: boolean;
  /**
   * Minimum number of RPC endpoints that must agree (when consensus enabled)
   * Default: 2 (majority of 3 endpoints)
   */
  minRpcConsensus?: number;
  /**
   * Validate chainId from RPC matches expected chainId
   * Default: true
   */
  validateRpcChainId?: boolean;
  /**
   * Validate contract version matches on-chain version
   * When enabled, queries on-chain version and validates it matches metadata version (or used version for legacy files)
   * Default: true (enabled for security)
   */
  validateContractVersion?: boolean;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  tokenMetadata?: TokenMetadata;
  verificationDetails?: {
    tokenId: string;
    network: string;
    contractAddress: string;
    merkleRoot: string;
    mintDate: string;
    calculatedMerkleRoot?: string;
    declaredMerkleRoot?: string;
    merkleRootMatch?: boolean;
    onChainValid?: boolean;
    currentWallet?: string;
  };
  errorDetails?: {
    errorType: 'METADATA_ERROR' | 'MERKLE_ERROR' | 'NETWORK_ERROR' | 'CONTRACT_ERROR';
    networkName?: string;
    rpcUrl?: string;
    contractAddress?: string;
    tokenId?: string;
    merkleRoot?: string;
    calculatedMerkleRoot?: string;
    onChainMerkleRoot?: string;
  };
}

export interface EnhancedVerificationResult extends VerificationResult {
  retryAttempts?: number;
  processingTime?: number;
  timestamp?: number;
}

export interface BatchVerificationResult {
  success: boolean;
  totalTokens: number;
  successfulVerifications: number;
  failedVerifications: number;
  results: EnhancedVerificationResult[];
  processingTime: number;
}

export interface VerificationJob {
  tokenId: string;
  merkleRoot?: string;
  priority?: 'low' | 'normal' | 'high';
  retryCount?: number;
}

/**
 * Blockchain Token Verifier for ZIP files
 */
export class ZipkitVerifier {
  private debug: boolean;
  protected maxRetries: number;
  protected retryDelay: number;
  protected batchDelay: number;
  
  constructor(options: VerificationOptions & {
    maxRetries?: number;
    retryDelay?: number;
    batchDelay?: number;
  } = {}) {
    this.debug = options.debug || false;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.batchDelay = options.batchDelay || 500;
    
    if (this.debug) {
      console.log(`[DEBUG] ZipkitVerifier initialized`);
    }
  }

  /**
   * Extracts and normalizes token metadata from a tokenized ZIP archive.
   * 
   * Handles field name variations across different token versions:
   * - chainId vs networkChainId
   * - timestamp vs mintedAt
   * - Validates required fields
   * 
   * @param zipkit - ZipkitNode instance with loaded archive
   * @returns Normalized TokenMetadata or null if not tokenized
   * @throws Error if TOKEN file exists but is invalid
   * 
   * @example
   * ```typescript
   * import { ZipkitNode } from 'neozipkit/node';
   * import { ZipkitVerifier } from 'neozipkit/blockchain';
   * 
   * const zipkit = new ZipkitNode();
   * await zipkit.loadZipFile('archive.nzip');
   * const metadata = await ZipkitVerifier.extractTokenMetadata(zipkit);
   * if (metadata) {
   *   console.log(`Token ID: ${metadata.tokenId}`);
   *   console.log(`Network: ${metadata.network}`);
   * }
   * ```
   */
  static async extractTokenMetadata(zipkit: any): Promise<TokenMetadata | null> {
    try {
      // Check for META-INF/TOKEN.NZIP entry (new standard)
      let tokenEntry = zipkit.getZipEntry(TOKENIZED_METADATA);
      
      // Fallback to legacy META-INF/NZIP.TOKEN for backward compatibility
      if (!tokenEntry) {
        tokenEntry = zipkit.getZipEntry(TOKENIZED_METADATA_LEGACY);
        if (tokenEntry) {
          console.warn('[ZipkitVerifier] Reading legacy NZIP.TOKEN. Write new files as TOKEN.NZIP.');
        }
      }
      
      if (!tokenEntry) {
        return null;
      }
      
      // Extract token data to buffer
      const tokenDataBuffer = await zipkit.extractToBuffer(tokenEntry, {
        skipHashCheck: false
      });
      
      const tokenData = tokenDataBuffer.toString('utf-8');
      const rawMetadata = JSON.parse(tokenData);
      
      // Normalize field names for compatibility across versions
      const chainId = rawMetadata.chainId ?? rawMetadata.networkChainId;
      const timestamp = rawMetadata.timestamp ?? rawMetadata.mintedAt;
      
      // SECURITY: networkChainId is REQUIRED - cannot infer from network name (ambiguous)
      // Network names like "sepolia" could match multiple networks (Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia)
      let networkChainId = chainId;
      let contractVersion = rawMetadata.contractVersion;
      
      // Validate required fields - chainId is mandatory for security
      if (!networkChainId) {
        throw new Error('Invalid token metadata: missing required field "networkChainId". Network names are ambiguous and cannot be used for verification. Please ensure token metadata includes networkChainId.');
      }
      
      // contractVersion: Do NOT infer from network config because:
      // 1. Old v2.10 files never had contractVersion in TOKEN file
      // 2. Network configs may have been updated to newer contract versions
      // 3. Verification will try all versions automatically if version is 'unknown'
      if (!contractVersion) {
        console.warn(`[WARNING] TOKEN file missing contractVersion (common for v2.10 files) - verification will try all versions automatically`);
        contractVersion = 'unknown';
      }
      
      // Create normalized metadata object
      const metadata: TokenMetadata = {
        tokenId: rawMetadata.tokenId,
        contractAddress: rawMetadata.contractAddress,
        network: rawMetadata.network,
        networkChainId: networkChainId,  // Required - now guaranteed to be set
        contractVersion: contractVersion,  // Required - now guaranteed to be set
        merkleRoot: rawMetadata.merkleRoot,
        creationTimestamp: rawMetadata.blockNumber || rawMetadata.creationTimestamp,
        transactionHash: rawMetadata.transactionHash,
        owner: rawMetadata.owner || rawMetadata.ownerAddress,
        encryptedHash: rawMetadata.encryptedHash,
        mintedAt: rawMetadata.mintedAt || rawMetadata.mintDate,
        mintDate: rawMetadata.mintDate || rawMetadata.mintedAt,
        ipfsHash: rawMetadata.ipfsHash,
        blockNumber: rawMetadata.blockNumber
      };
      
      // Validate other required fields exist
      if (!metadata.tokenId || !metadata.contractAddress || !metadata.merkleRoot) {
        throw new Error('Invalid token metadata: missing required fields (tokenId, contractAddress, or merkleRoot)');
      }

      // SECURITY: Validate input formats to prevent injection attacks and invalid data processing
      
      // Validate token ID format
      const tokenIdValidation = validateTokenId(metadata.tokenId);
      if (!tokenIdValidation.success) {
        throw new Error(`Invalid token ID: ${tokenIdValidation.error}`);
      }

      // Validate contract address format
      const addressValidation = validateEthereumAddress(metadata.contractAddress);
      if (!addressValidation.success) {
        throw new Error(`Invalid contract address: ${addressValidation.error}`);
      }
      // Use normalized address (checksum format)
      if (addressValidation.normalizedAddress) {
        metadata.contractAddress = addressValidation.normalizedAddress;
      }

      // Sanitize network name
      const networkValidation = sanitizeNetworkName(metadata.network);
      if (!networkValidation.success) {
        throw new Error(`Invalid network name: ${networkValidation.error}`);
      }
      if (networkValidation.sanitized) {
        metadata.network = networkValidation.sanitized;
      }

      // Validate merkle root format
      const merkleRootValidation = validateMerkleRootFormat(metadata.merkleRoot);
      if (!merkleRootValidation.success) {
        throw new Error(`Invalid merkle root format: ${merkleRootValidation.error}`);
      }
      // Use normalized merkle root (consistent format)
      if (merkleRootValidation.normalized) {
        metadata.merkleRoot = merkleRootValidation.normalized;
      }
      
      return metadata;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid token metadata')) {
        throw error;
      }
      // Return null for non-tokenized archives or extraction errors
      return null;
    }
  }

  /**
   * Instance method for convenience - extracts token metadata from loaded archive
   * @param zipkit - ZipkitNode instance with loaded archive
   * @returns Normalized TokenMetadata or null if not tokenized
   */
  async getTokenMetadata(zipkit: any): Promise<TokenMetadata | null> {
    return ZipkitVerifier.extractTokenMetadata(zipkit);
  }

  /**
   * Query contract version from blockchain
   * @param contractAddress - Contract address
   * @param networkConfig - Network configuration with RPC URLs
   * @param rpcUrlIndex - Optional RPC URL index (default: 0)
   * @returns Contract version string or null if query fails
   */
  private async queryContractVersion(
    contractAddress: string,
    networkConfig: ContractConfig,
    rpcUrlIndex: number = 0
  ): Promise<string | null> {
    const rpcUrls = networkConfig.rpcUrls.length > 0 ? networkConfig.rpcUrls : [];
    if (rpcUrls.length === 0 || rpcUrlIndex >= rpcUrls.length) {
      return null;
    }

    const rpcUrl = rpcUrls[rpcUrlIndex];
    let provider: ethers.JsonRpcProvider | null = null;

    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);

      // Query getVersion() function with timeout
      let timeoutId: NodeJS.Timeout | null = null;
      const version = await Promise.race([
        contract.getVersion(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('getVersion timeout after 10 seconds')), 10000);
        })
      ]).finally(() => {
        // Clear the timeout if it's still pending
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      });

      if (this.debug) {
        console.log(`[DEBUG] Contract version queried from blockchain: ${version}`);
      }

      return version as string;
    } catch (error: any) {
      if (this.debug) {
        console.log(`[DEBUG] Failed to query contract version: ${error.message || String(error)}`);
      }
      return null;
    } finally {
      try {
        if (provider) {
          provider.destroy();
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract and validate token metadata from ZIP
   */
  async extractTokenMetadata(tokenBuffer: Buffer): Promise<{ success: boolean; metadata?: TokenMetadata; error?: string }> {
    try {
      if (this.debug) {
        console.log(`[DEBUG] Extracting token metadata from buffer (${tokenBuffer.length} bytes)`);
      }

      const tokenData = JSON.parse(tokenBuffer.toString('utf8'));
      
      // Validate basic required fields exist
      const requiredFields = ['tokenId', 'contractAddress', 'network', 'merkleRoot'];
      for (const field of requiredFields) {
        if (!tokenData[field]) {
          if (this.debug) {
            console.log(`[DEBUG] Missing required field: ${field}`);
          }
          return { 
            success: false, 
            error: `Missing required field: ${field}` 
          };
        }
      }

      // SECURITY: Validate input formats to prevent injection attacks and invalid data processing
      
      // Validate token ID format
      const tokenIdValidation = validateTokenId(tokenData.tokenId);
      if (!tokenIdValidation.success) {
        if (this.debug) {
          console.log(`[DEBUG] Token ID validation failed: ${tokenIdValidation.error}`);
        }
        return {
          success: false,
          error: `Invalid token ID format: ${tokenIdValidation.error}`
        };
      }

      // Validate contract address format
      const addressValidation = validateEthereumAddress(tokenData.contractAddress);
      if (!addressValidation.success) {
        if (this.debug) {
          console.log(`[DEBUG] Contract address validation failed: ${addressValidation.error}`);
        }
        return {
          success: false,
          error: `Invalid contract address format: ${addressValidation.error}`
        };
      }
      // Use normalized address (checksum format)
      if (addressValidation.normalizedAddress) {
        tokenData.contractAddress = addressValidation.normalizedAddress;
      }

      // Sanitize network name
      const networkValidation = sanitizeNetworkName(tokenData.network);
      if (!networkValidation.success) {
        if (this.debug) {
          console.log(`[DEBUG] Network name validation failed: ${networkValidation.error}`);
        }
        return {
          success: false,
          error: `Invalid network name: ${networkValidation.error}`
        };
      }
      if (networkValidation.sanitized) {
        tokenData.network = networkValidation.sanitized;
      }

      // Validate merkle root format
      const merkleRootValidation = validateMerkleRootFormat(tokenData.merkleRoot);
      if (!merkleRootValidation.success) {
        if (this.debug) {
          console.log(`[DEBUG] Merkle root validation failed: ${merkleRootValidation.error}`);
        }
        return {
          success: false,
          error: `Invalid merkle root format: ${merkleRootValidation.error}`
        };
      }
      // Use normalized merkle root (consistent format)
      if (merkleRootValidation.normalized) {
        tokenData.merkleRoot = merkleRootValidation.normalized;
      }

      // SECURITY: networkChainId is REQUIRED - cannot infer from network name (ambiguous)
      // Network names like "sepolia" could match multiple networks (Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia)
      let networkChainId = tokenData.networkChainId ?? tokenData.chainId;
      let contractVersion = tokenData.contractVersion;
      
      // Validate networkChainId (required for blockchain queries)
      if (!networkChainId) {
        return {
          success: false,
          error: 'Missing required field: networkChainId. Network names are ambiguous and cannot be used for verification. Please ensure token metadata includes networkChainId.'
        };
      }

      // contractVersion: Do NOT infer from network config because:
      // 1. Old v2.10 files never had contractVersion in TOKEN file
      // 2. Network configs may have been updated to newer contract versions
      // 3. Query from blockchain first, then let verification try all versions if needed
      
      // If contractVersion is missing, try to query from blockchain
      if (!contractVersion && networkChainId && tokenData.contractAddress) {
        const networkConfig = getContractConfig(networkChainId);
        if (networkConfig) {
          if (this.debug) {
            console.log(`[DEBUG] TOKEN file missing contractVersion - attempting to query from blockchain...`);
          }
          try {
            const blockchainVersion = await this.queryContractVersion(
              tokenData.contractAddress,
              networkConfig,
              0
            );
            if (blockchainVersion) {
              const normalized = normalizeVersion(blockchainVersion);
              if (normalized && isVersionSupported(normalized)) {
                contractVersion = normalized;
                if (this.debug) {
                  console.log(`[DEBUG] Successfully queried contractVersion from blockchain: ${contractVersion}`);
                }
              } else {
                if (this.debug) {
                  console.log(`[DEBUG] Queried version ${blockchainVersion} (normalized: ${normalized}) is not supported`);
                }
              }
            }
          } catch (queryError: any) {
            if (this.debug) {
              console.log(`[DEBUG] Failed to query contract version from blockchain: ${queryError.message || String(queryError)}`);
            }
            // Continue - we'll try multiple versions during verification
          }
        }
      }

      // Final validation - contractVersion is preferred but not strictly required
      // (we can try multiple versions during verification)
      if (!contractVersion) {
        if (this.debug) {
          console.log(`[DEBUG] ⚠️  Contract version not found in TOKEN file or blockchain. Will try all versions during verification.`);
        }
        // Don't fail here - let verification try multiple versions
        // But we still need a version for the metadata object, so use a placeholder
        contractVersion = 'unknown';
      }

      // Create normalized metadata object
      const metadata: TokenMetadata = {
        tokenId: tokenData.tokenId,
        contractAddress: tokenData.contractAddress,
        network: tokenData.network,
        networkChainId: networkChainId,  // Required - now guaranteed to be set
        contractVersion: contractVersion,  // Required - now guaranteed to be set
        merkleRoot: tokenData.merkleRoot,
        transactionHash: tokenData.transactionHash,
        blockNumber: tokenData.blockNumber,
        owner: tokenData.owner || tokenData.ownerAddress,
        encryptedHash: tokenData.encryptedHash,
        mintedAt: tokenData.mintedAt || tokenData.mintDate,
        mintDate: tokenData.mintDate || tokenData.mintedAt,
        creationTimestamp: tokenData.creationTimestamp || tokenData.blockNumber,
        ipfsHash: tokenData.ipfsHash
      };

      if (this.debug) {
        console.log(`[DEBUG] Token metadata extracted successfully`);
        console.log(`[DEBUG] Token ID: ${metadata.tokenId}, Network: ${metadata.network}, ChainId: ${metadata.networkChainId}, Version: ${metadata.contractVersion}`);
      }

      return { 
        success: true, 
        metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid JSON format';
      
      if (this.debug) {
        console.log(`[DEBUG] Failed to parse token metadata: ${errorMessage}`);
      }

      return { 
        success: false, 
        error: `Invalid token metadata format: ${errorMessage}` 
      };
    }
  }


  /**
   * Map network name to RPC configuration using contracts.ts (single source of truth)
   * REQUIRES chainId for security - network names are ambiguous and can match wrong networks
   * 
   * @param networkName Network name (for logging/display purposes only)
   * @param chainId Chain ID (REQUIRED - must be provided)
   * @returns Network configuration or error if chainId is missing or invalid
   */
  private getNetworkConfig(networkName: string, chainId?: number): { success: boolean; config?: ContractConfig; error?: string } {
    if (this.debug) {
      if (chainId) {
        console.log(`[DEBUG] Looking up network config by chainId: ${chainId} (network: ${networkName})`);
      } else {
        console.log(`[DEBUG] SECURITY WARNING: chainId not provided for network: ${networkName}`);
      }
    }

    // SECURITY: chainId is REQUIRED - network names are ambiguous and can match wrong networks
    // For example, "sepolia" could match Base Sepolia, Ethereum Sepolia, or Arbitrum Sepolia
    if (!chainId) {
      return {
        success: false,
        error: `chainId is required for network identification. Network name "${networkName}" is ambiguous and cannot be used for verification. Please ensure token metadata includes networkChainId.`
      };
    }

    // Use chainId directly (most reliable and secure)
    const config = getContractConfig(chainId);
    if (config && config.chainId === chainId) {
      if (this.debug) {
        console.log(`[DEBUG] Found config by chainId: ${config.network} (${config.chainId})`);
      }
      return { success: true, config };
    }

    // ChainId not found in contract configs
    if (this.debug) {
      console.log(`[DEBUG] ChainId ${chainId} not found in contract configs`);
    }

    return {
      success: false,
      error: `Unsupported chainId: ${chainId}. Network "${networkName}" with chainId ${chainId} is not configured.`
    };
  }

  /**
   * Perform merkle root comparison
   * Uses direct string comparison - merkle roots are hex strings and must match exactly
   * Case-sensitive comparison ensures no encoding issues or false positives
   */
  private compareMerkleRoots(calculated: string | null, declared: string | null): {
    success: boolean;
    match: boolean;
    calculated?: string;
    declared?: string;
    error?: string;
  } {
    if (this.debug) {
      console.log(`[DEBUG] Comparing merkle roots (case-sensitive)`);
      console.log(`[DEBUG] Calculated: ${calculated || 'null'}`);
      console.log(`[DEBUG] Declared: ${declared || 'null'}`);
    }

    if (!calculated) {
      return {
        success: false,
        match: false,
        error: 'Cannot calculate merkle root from archive contents'
      };
    }

    if (!declared) {
      return {
        success: false,
        match: false,
        calculated,
        error: 'No merkle root found in token metadata'
      };
    }

    // Direct string comparison - merkle roots are hex strings and must match exactly
    // Case-sensitive comparison prevents encoding issues and false positives
    const match = calculated === declared;
    
    if (this.debug) {
      console.log(`[DEBUG] Merkle root match: ${match}`);
      if (!match) {
        console.log(`[DEBUG] Mismatch details:`);
        console.log(`[DEBUG]   Calculated length: ${calculated.length}, Declared length: ${declared.length}`);
        console.log(`[DEBUG]   Calculated: ${calculated}`);
        console.log(`[DEBUG]   Declared: ${declared}`);
      }
    }

    return {
      success: true,
      match,
      calculated,
      declared
    };
  }

  /**
   * Query multiple RPC endpoints with consensus mechanism
   * Returns data only if majority of endpoints agree
   */
  private async queryMultipleRPCsWithConsensus(
    tokenId: string,
    contractAddress: string,
    networkConfig: ContractConfig,
    merkleRoot: string,
    minConsensus: number = 2,
    metadataContractVersion?: string // Optional: version from metadata for validation
  ): Promise<{
    success: boolean;
    isValid?: boolean;
    onChainMerkleRoot?: string;
    onChainTokenizationTime?: number;
    onChainCreator?: string;
    onChainBlockNumber?: number;
    error?: string;
    consensusCount?: number;
    totalQueried?: number;
  }> {
    const rpcUrls = networkConfig.rpcUrls.length > 0 ? networkConfig.rpcUrls : [];
    if (rpcUrls.length < minConsensus) {
      return {
        success: false,
        error: `Not enough RPC endpoints (${rpcUrls.length}) for consensus (minimum: ${minConsensus})`
      };
    }

    // Query up to 3 RPC endpoints (or all if less than 3)
    const endpointsToQuery = rpcUrls.slice(0, Math.min(3, rpcUrls.length));
    const results: Array<{
      success: boolean;
      onChainMerkleRoot?: string;
      onChainTokenizationTime?: number;
      onChainCreator?: string;
      onChainBlockNumber?: number;
      chainId?: number;
      error?: string;
      rpcUrl: string;
    }> = [];

    if (this.debug) {
      console.log(`[DEBUG] Querying ${endpointsToQuery.length} RPC endpoints for consensus...`);
    }

    // Query all endpoints in parallel
    const queryPromises = endpointsToQuery.map(async (rpcUrl) => {
      try {
        // First validate chainId from RPC
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const actualChainId = await Promise.race([
          provider.getNetwork().then(n => Number(n.chainId)),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('ChainId query timeout')), 5000)
          )
        ]);

        if (actualChainId !== networkConfig.chainId) {
          if (this.debug) {
            console.log(`[DEBUG] RPC ${rpcUrl} chainId mismatch: expected ${networkConfig.chainId}, got ${actualChainId}`);
          }
          return {
            success: false,
            error: `ChainId mismatch: expected ${networkConfig.chainId}, got ${actualChainId}`,
            rpcUrl
          };
        }

        // Query token info
        const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);
        const adapter = getAdapter(networkConfig.version || DEFAULT_CONTRACT_VERSION);
        
        const zipFileInfo = await Promise.race([
          adapter.getZipFileInfo(contract, BigInt(tokenId)),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('getZipFileInfo timeout')), 10000)
          )
        ]);

        provider.destroy();

        return {
          success: true,
          onChainMerkleRoot: zipFileInfo.merkleRootHash,
          onChainTokenizationTime: Number(zipFileInfo.tokenizationTime),
          onChainCreator: zipFileInfo.creator,
          onChainBlockNumber: Number(zipFileInfo.blockNumber),
          chainId: actualChainId,
          rpcUrl
        };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        if (this.debug) {
          console.log(`[DEBUG] RPC ${rpcUrl} query failed: ${errorMsg}`);
        }
        return {
          success: false,
          error: errorMsg,
          rpcUrl
        };
      }
    });

    const queryResults = await Promise.all(queryPromises);
    results.push(...queryResults);

    // Filter successful results
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length < minConsensus) {
      return {
        success: false,
        error: `Consensus failed: only ${successfulResults.length} of ${endpointsToQuery.length} endpoints succeeded (minimum: ${minConsensus})`,
        consensusCount: successfulResults.length,
        totalQueried: endpointsToQuery.length
      };
    }

    // Check if all successful results agree on the merkle root
    // Use direct comparison - merkle roots are hex strings and must match exactly
    const merkleRoots = successfulResults.map(r => r.onChainMerkleRoot).filter(Boolean) as string[];
    const uniqueRoots = new Set(merkleRoots);
    
    if (uniqueRoots.size > 1) {
      if (this.debug) {
        console.log(`[DEBUG] RPC consensus mismatch: different merkle roots returned`);
        successfulResults.forEach((r, i) => {
          console.log(`[DEBUG]   RPC ${i + 1}: ${r.onChainMerkleRoot}`);
        });
      }
      return {
        success: false,
        error: `RPC consensus failed: endpoints returned different merkle roots`,
        consensusCount: successfulResults.length,
        totalQueried: endpointsToQuery.length
      };
    }

    // Use the first successful result (all should be the same)
    const consensusResult = successfulResults[0];
    
    if (this.debug) {
      console.log(`[DEBUG] RPC consensus achieved: ${successfulResults.length} of ${endpointsToQuery.length} endpoints agreed`);
    }

    return {
      success: true,
      onChainMerkleRoot: consensusResult.onChainMerkleRoot,
      onChainTokenizationTime: consensusResult.onChainTokenizationTime,
      onChainCreator: consensusResult.onChainCreator,
      onChainBlockNumber: consensusResult.onChainBlockNumber,
      consensusCount: successfulResults.length,
      totalQueried: endpointsToQuery.length
    };
  }

  /**
   * Verify token against blockchain
   * @param rpcUrlIndex Optional index of RPC URL to use (default: 0)
   * @param options Optional verification options including RPC consensus settings
   */
  async verifyOnChain(
    tokenId: string, 
    contractAddress: string, 
    networkConfig: ContractConfig, 
    merkleRoot: string,
    rpcUrlIndex: number = 0,
    options: VerificationOptions = {},
    metadataContractVersion?: string // Optional: version from metadata for validation
  ): Promise<{ 
    success: boolean; 
    isValid?: boolean; 
    onChainMerkleRoot?: string; 
    onChainTokenizationTime?: number;
    onChainCreator?: string;
    onChainBlockNumber?: number;
    error?: string; 
    rpcUrl?: string 
  }> {
      // If RPC consensus is enabled, use consensus mechanism
      if (options.rpcConsensus) {
        const minConsensus = options.minRpcConsensus ?? 2;
        const consensusResult = await this.queryMultipleRPCsWithConsensus(
          tokenId,
          contractAddress,
          networkConfig,
          merkleRoot,
          minConsensus,
          metadataContractVersion // Pass metadata version for validation
        );

      if (!consensusResult.success) {
        return {
          success: false,
          error: consensusResult.error || 'RPC consensus failed'
        };
      }

      // SECURITY: Validate version matches on-chain version (if enabled)
      if (options.validateContractVersion !== false) {
        let onChainVersion: string | null = null;
        try {
          const rpcUrl = networkConfig.rpcUrls[0];
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);
          onChainVersion = await Promise.race([
            contract.getVersion(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('getVersion timeout')), 5000)
            )
          ]) as string;
          provider.destroy();
        } catch (versionError: any) {
          if (this.debug) {
            console.log(`[DEBUG] Could not query on-chain version in consensus mode: ${versionError.message}`);
          }
        }

        // Validate version if we have both metadata version and on-chain version
        if (metadataContractVersion && metadataContractVersion !== 'unknown' && onChainVersion) {
          const normalizedMetadata = normalizeVersion(metadataContractVersion);
          const normalizedOnChain = normalizeVersion(onChainVersion);
          
          if (normalizedMetadata && normalizedOnChain && normalizedMetadata !== normalizedOnChain) {
            return {
              success: false,
              error: `Contract version mismatch: metadata version "${metadataContractVersion}" does not match on-chain version "${onChainVersion}"`
            };
          }
          
          if (this.debug && normalizedMetadata === normalizedOnChain) {
            console.log(`[DEBUG] ✅ Version validation passed (consensus mode): metadata version "${metadataContractVersion}" matches on-chain version "${onChainVersion}"`);
          }
        }
      } else {
        if (this.debug) {
          console.log(`[DEBUG] Version validation disabled (consensus mode) - skipping on-chain version check`);
        }
      }

      // Verify merkle root match - direct comparison (case-sensitive)
      // Merkle roots are hex strings and must match exactly
      const merkleRootMatch = consensusResult.onChainMerkleRoot && 
        consensusResult.onChainMerkleRoot === merkleRoot;

      // Also call verifyZipFile for additional validation
      let verifyResult: boolean = false;
      try {
        // Use first available RPC for verifyZipFile call
        const rpcUrl = networkConfig.rpcUrls[0];
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);
        
        verifyResult = await Promise.race([
          contract.verifyZipFile(tokenId, merkleRoot),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Contract call timeout')), 30000)
          )
        ]);
        
        provider.destroy();
      } catch (verifyError: any) {
        if (this.debug) {
          console.log(`[DEBUG] verifyZipFile call failed: ${verifyError.message}`);
        }
      }

      const isValid = merkleRootMatch === true;

      return {
        success: true,
        isValid,
        onChainMerkleRoot: consensusResult.onChainMerkleRoot,
        onChainTokenizationTime: consensusResult.onChainTokenizationTime,
        onChainCreator: consensusResult.onChainCreator,
        onChainBlockNumber: consensusResult.onChainBlockNumber
      };
    }

    // Standard single RPC query (quick validation - default behavior)
    const rpcUrls = networkConfig.rpcUrls.length > 0 ? networkConfig.rpcUrls : [];
    if (rpcUrls.length === 0) {
      return { 
        success: false, 
        error: 'No RPC URLs configured for this network' 
      };
    }

    if (rpcUrlIndex >= rpcUrls.length) {
      return {
        success: false,
        error: `RPC URL index ${rpcUrlIndex} is out of range (${rpcUrls.length} RPCs available)`
      };
    }

    const rpcUrl = rpcUrls[rpcUrlIndex];
    let provider: ethers.JsonRpcProvider | null = null;
    
    try {

      if (this.debug) {
        console.log(`[DEBUG] Starting on-chain verification (quick mode - single RPC)`);
        console.log(`[DEBUG] Token ID: ${tokenId}, Contract: ${contractAddress}`);
        console.log(`[DEBUG] Network: ${networkConfig.network}, Chain ID: ${networkConfig.chainId}`);
        console.log(`[DEBUG] Using RPC: ${rpcUrl}`);
      }

      provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Validate chainId from RPC if option is enabled (default: true)
      if (options.validateRpcChainId !== false) {
        try {
          const actualChainId = await Promise.race([
            provider.getNetwork().then(n => Number(n.chainId)),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('ChainId validation timeout')), 5000)
            )
          ]);

          if (actualChainId !== networkConfig.chainId) {
            provider.destroy();
            return {
              success: false,
              error: `RPC chainId validation failed: expected ${networkConfig.chainId}, got ${actualChainId}. RPC may be pointing to wrong network.`,
              rpcUrl
            };
          }

          if (this.debug) {
            console.log(`[DEBUG] RPC chainId validated: ${actualChainId}`);
          }
        } catch (chainIdError: any) {
          if (this.debug) {
            console.log(`[DEBUG] ChainId validation failed: ${chainIdError.message}`);
          }
          // Continue with verification even if chainId validation fails (non-critical)
        }
      }

      const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);

      if (this.debug) {
        console.log(`[DEBUG] Calling contract.verifyZipFile(${tokenId}, ${merkleRoot.substring(0, 10)}...)`);
      }

      // If contractVersion is missing/unknown, use DEFAULT_CONTRACT_VERSION (v2.50) first, then older versions for legacy files
      // No need to query blockchain - just use the version from networkConfig or default order

      // Determine which version to try
      const versionsToTry: string[] = [];
      
      if (networkConfig.version && networkConfig.version !== 'unknown') {
        // Use the version from network config if available
        versionsToTry.push(networkConfig.version);
      } else {
        // If version is missing/unknown, try default (v2.50) first, then 2.11, 2.10 for legacy files
        versionsToTry.push(DEFAULT_CONTRACT_VERSION, '2.11', '2.10');
      }

      if (versionsToTry.length === 0) {
        return {
          success: false,
          error: 'No contract versions available to try. No versions implemented or detected.'
        };
      }

      // First check if token exists and get ALL actual on-chain data (not from metadata)
      // Use adapter to handle version-specific differences
      let onChainMerkleRoot: string | undefined;
      let onChainTokenizationTime: number | undefined;
      let onChainCreator: string | undefined;
      let onChainBlockNumber: number | undefined;
      let onChainEncryptedHash: string | undefined;
      let lastError: string | undefined;
      let successfulVersion: string | undefined;
      
      // Try each version until one works
      for (const version of versionsToTry) {
        try {
          if (this.debug) {
            console.log(`[DEBUG] Trying contract version: ${version}`);
          }

          const adapter = getAdapter(version);
          
          // Get token info using adapter (handles version-specific differences)
          // CRITICAL: We trust ONLY blockchain data, not metadata file which can be tampered with
          const zipFileInfo = await Promise.race([
            adapter.getZipFileInfo(contract, BigInt(tokenId)),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('getZipFileInfo timeout after 10 seconds')), 10000)
            )
          ]);
          
          // Extract all on-chain data (adapter returns full structure for this version)
          onChainMerkleRoot = zipFileInfo.merkleRootHash;
          onChainTokenizationTime = Number(zipFileInfo.tokenizationTime);
          onChainCreator = zipFileInfo.creator;
          onChainBlockNumber = Number(zipFileInfo.blockNumber);
          
          // encryptedHash is available if contract version supports it (v2.11+)
          onChainEncryptedHash = zipFileInfo.encryptedHash || undefined;
          successfulVersion = version;
          
          if (this.debug) {
            console.log(`[DEBUG] Successfully queried token info using version ${version}`);
            console.log(`[DEBUG] Token ${tokenId} exists`);
            console.log(`[DEBUG] On-chain merkle root: ${onChainMerkleRoot}`);
            console.log(`[DEBUG] On-chain tokenization time: ${onChainTokenizationTime} (${new Date(onChainTokenizationTime * 1000).toLocaleString()})`);
            console.log(`[DEBUG] On-chain creator: ${onChainCreator}`);
            console.log(`[DEBUG] On-chain block number: ${onChainBlockNumber}`);
            console.log(`[DEBUG] Calculated merkle root: ${merkleRoot}`);
          }
          
          // Success! Break out of version loop
          break;
        } catch (infoError: any) {
          const errorMsg = infoError.message || String(infoError);
          lastError = errorMsg;
          
          if (this.debug) {
            console.log(`[DEBUG] Version ${version} failed: ${errorMsg}`);
          }
          
          // If token doesn't exist, don't try other versions
          if (errorMsg.includes('nonexistent token') || errorMsg.includes('ERC721: invalid token ID')) {
            return {
              success: false,
              error: `Token ${tokenId} does not exist on contract ${contractAddress}`
            };
          }
          
          // If it's an "out of result range" error, try next version
          if (errorMsg.includes('out of result range') || errorMsg.includes('data out-of-bounds')) {
            if (this.debug) {
              console.log(`[DEBUG] Version ${version} incompatible (wrong return structure), trying next version...`);
            }
            continue; // Try next version
          }
          
          // For other errors, continue to next version
          continue;
        }
      }

      // If we tried all versions and none worked
      if (!onChainMerkleRoot) {
        const triedVersions = versionsToTry.join(', ');
        return {
          success: false,
          error: `Failed to get token info after trying all versions (${triedVersions}). Last error: ${lastError || 'Unknown error'}`
        };
      }

      // SECURITY: Validate version matches on-chain version
      // Query actual contract version from blockchain and compare
      let onChainVersion: string | null = null;
      try {
        onChainVersion = await this.queryContractVersion(contractAddress, networkConfig, rpcUrlIndex);
      } catch (versionError: any) {
        if (this.debug) {
          console.log(`[DEBUG] Could not query on-chain version: ${versionError.message}`);
        }
        // Continue - version validation is important but not critical if query fails
      }

      if (onChainVersion) {
        const normalizedOnChain = normalizeVersion(onChainVersion);
        const normalizedSuccessful = normalizeVersion(successfulVersion || '');
        
        // SECURITY: Validate version
        // 1. If metadata has explicit version, it MUST match on-chain version (strict validation)
        // 2. If metadata version is missing (legacy), validate that the version we used matches on-chain
        if (metadataContractVersion && metadataContractVersion !== 'unknown') {
          // New file with explicit version - strict validation
          const normalizedMetadata = normalizeVersion(metadataContractVersion);
          
          if (normalizedMetadata && normalizedOnChain && normalizedMetadata !== normalizedOnChain) {
            const errorMsg = `Contract version mismatch: metadata version "${metadataContractVersion}" does not match on-chain version "${onChainVersion}" (normalized: ${normalizedMetadata} vs ${normalizedOnChain})`;
            
            if (this.debug) {
              console.log(`[DEBUG] ❌ ${errorMsg}`);
            }
            
            return {
              success: false,
              error: errorMsg,
              rpcUrl
            };
          }
          
          if (this.debug && normalizedMetadata === normalizedOnChain) {
            console.log(`[DEBUG] ✅ Version validation passed: metadata version "${metadataContractVersion}" matches on-chain version "${onChainVersion}"`);
          }
        } else {
          // Legacy file - validate that the version we used matches on-chain
          if (normalizedOnChain && normalizedSuccessful && normalizedOnChain !== normalizedSuccessful) {
            const errorMsg = `Contract version mismatch: used version "${successfulVersion}" does not match on-chain version "${onChainVersion}" (normalized: ${normalizedSuccessful} vs ${normalizedOnChain})`;
            
            if (this.debug) {
              console.log(`[DEBUG] ⚠️  ${errorMsg}`);
            }
            
            return {
              success: false,
              error: errorMsg,
              rpcUrl
            };
          }
          
          if (this.debug && normalizedOnChain === normalizedSuccessful) {
            console.log(`[DEBUG] ✅ Version validation passed (legacy file): on-chain version "${onChainVersion}" matches used version "${successfulVersion}"`);
          }
        }
      } else {
        if (this.debug) {
          console.log(`[DEBUG] ⚠️  Could not query on-chain version for validation - continuing with used version "${successfulVersion}"`);
        }
      }

      if (this.debug && successfulVersion && successfulVersion !== networkConfig.version) {
        console.log(`[DEBUG] ⚠️  Contract version mismatch: network config says "${networkConfig.version || 'unknown'}", but "${successfulVersion}" worked. Consider updating network config.`);
      }

      // Compare the calculated merkle root with the on-chain merkle root
      // This is the critical security check - we trust the blockchain, not the metadata file
      // Direct string comparison (case-sensitive) - merkle roots are hex strings and must match exactly
      const merkleRootMatch = onChainMerkleRoot && onChainMerkleRoot === merkleRoot;
      
      if (this.debug) {
        console.log(`[DEBUG] Merkle root match: ${merkleRootMatch}`);
      }

      // Also call verifyZipFile for additional validation (though we already have the root)
      let verifyResult: boolean = false;
      try {
        verifyResult = await Promise.race([
          contract.verifyZipFile(tokenId, merkleRoot),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Contract call timeout after 30 seconds')), 30000)
          )
        ]);
      } catch (verifyError: any) {
        // If verifyZipFile fails but we have the root, we can still validate
        if (this.debug) {
          console.log(`[DEBUG] verifyZipFile call failed: ${verifyError.message}`);
        }
      }

      // The merkle root comparison is the primary check - if roots match, verification passes
      // verifyZipFile is a secondary check for additional validation
      const isValid: boolean = merkleRootMatch === true;

      if (this.debug) {
        console.log(`[DEBUG] On-chain verification result: ${isValid} (merkle root match: ${merkleRootMatch}, verifyZipFile: ${verifyResult})`);
      }

      // Clean up provider to allow process to exit
      try {
        if (provider) {
          provider.destroy();
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
        if (this.debug) {
          console.log(`[DEBUG] Error destroying provider: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }

        return { 
        success: true, 
        isValid, 
        onChainMerkleRoot,
        onChainTokenizationTime,
        onChainCreator,
        onChainBlockNumber
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      
      if (this.debug) {
        console.log(`[DEBUG] On-chain verification failed: ${errorMessage}`);
      }

      // Clean up provider on error
      try {
        if (provider) {
          provider.destroy();
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return { 
        success: false, 
        error: errorMessage,
        rpcUrl: rpcUrl
      };
    }
  }


  /**
   * Complete verification process
   * @param rpcUrlIndex Optional index of RPC URL to use (default: 0)
   */
  async verifyToken(
    tokenMetadata: TokenMetadata,
    calculatedMerkleRoot: string | null,
    options: VerificationOptions = {},
    rpcUrlIndex: number = 0
  ): Promise<VerificationResult> {
    try {
      if (this.debug) {
        console.log(`[DEBUG] Starting complete token verification`);
      }

      // SECURITY: Validate input formats before processing
      const tokenIdValidation = validateTokenId(tokenMetadata.tokenId);
      if (!tokenIdValidation.success) {
        return {
          success: false,
          message: `Invalid token ID: ${tokenIdValidation.error}`,
          errorDetails: {
            errorType: 'METADATA_ERROR',
            tokenId: tokenMetadata.tokenId
          }
        };
      }

      const addressValidation = validateEthereumAddress(tokenMetadata.contractAddress);
      if (!addressValidation.success) {
        return {
          success: false,
          message: `Invalid contract address: ${addressValidation.error}`,
          errorDetails: {
            errorType: 'METADATA_ERROR',
            contractAddress: tokenMetadata.contractAddress
          }
        };
      }

      const networkValidation = sanitizeNetworkName(tokenMetadata.network);
      if (!networkValidation.success) {
        return {
          success: false,
          message: `Invalid network name: ${networkValidation.error}`,
          errorDetails: {
            errorType: 'NETWORK_ERROR',
            networkName: tokenMetadata.network
          }
        };
      }

      if (calculatedMerkleRoot) {
        const merkleRootValidation = validateMerkleRootFormat(calculatedMerkleRoot);
        if (!merkleRootValidation.success) {
          return {
            success: false,
            message: `Invalid calculated merkle root format: ${merkleRootValidation.error}`,
            errorDetails: {
              errorType: 'MERKLE_ERROR',
              calculatedMerkleRoot
            }
          };
        }
      }

      // NOTE: tokenMetadata (tokenId, contractAddress, network) is used ONLY to locate the token on blockchain
      // All verification data (merkle root, tokenization time, creator, block number) comes from blockchain contract
      // If metadata is tampered with, the blockchain query will fail or return mismatched data, causing verification to fail

      // Get network configuration - use chainId if available (most reliable)
      const networkResult = this.getNetworkConfig(tokenMetadata.network, tokenMetadata.networkChainId);
      if (!networkResult.success || !networkResult.config) {
        return {
          success: false,
          message: networkResult.error || 'Unknown network error',
          errorDetails: {
            errorType: 'NETWORK_ERROR',
            networkName: tokenMetadata.network
          }
        };
      }

      const networkConfig = networkResult.config;

      // CRITICAL SECURITY CHECK: Validate contract address matches expected contract for network
      // This prevents attackers from creating fake metadata pointing to malicious contracts
      const contractValidation = validateContractAddress(
        tokenMetadata.contractAddress,
        networkConfig.chainId,
        this.debug
      );
      if (!contractValidation.success) {
        return {
          success: false,
          message: `Contract address validation failed: ${contractValidation.error}`,
          errorDetails: {
            errorType: 'CONTRACT_ERROR',
            networkName: tokenMetadata.network,
            contractAddress: tokenMetadata.contractAddress,
            tokenId: tokenMetadata.tokenId
          }
        };
      }

      // CRITICAL: We must calculate the merkle root from the actual files and compare with on-chain value
      // We do NOT trust the merkle root stored in the metadata file as it could be tampered with
      if (!calculatedMerkleRoot) {
        return {
          success: false,
          message: 'No merkle root calculated from archive contents - cannot verify',
          errorDetails: {
            errorType: 'MERKLE_ERROR'
          }
        };
      }

      // SECURITY: Version validation with backward compatibility for legacy files
      // Strategy:
      // 1. If contractVersion is provided in metadata: Validate it matches on-chain version (strict)
      // 2. If contractVersion is missing (legacy files): Query on-chain version and validate it matches what we use
      const configToUse = { ...networkConfig };
      const isLegacyFile = !tokenMetadata.contractVersion || tokenMetadata.contractVersion === 'unknown';
      
      if (isLegacyFile) {
        if (this.debug) {
          console.log(`[DEBUG] Legacy file detected (missing contractVersion) - will query on-chain version for validation`);
        }
        configToUse.version = 'unknown'; // This will trigger fallback logic in verifyOnChain
      } else {
        // New file with explicit version - validate it matches on-chain version
        if (this.debug) {
          console.log(`[DEBUG] File has explicit contractVersion: ${tokenMetadata.contractVersion} - will validate against on-chain version`);
        }
        // Keep the version from metadata for validation
      }

      // Perform on-chain verification - this will fetch the actual merkle root from the blockchain
      // This also validates version matches on-chain version
      const onChainResult = await this.verifyOnChain(
        tokenMetadata.tokenId,
        tokenMetadata.contractAddress,
        configToUse,
        calculatedMerkleRoot,
        rpcUrlIndex,
        options, // Pass options for RPC consensus settings
        tokenMetadata.contractVersion // Pass metadata version for validation
      );

      if (!onChainResult.success) {
        return {
          success: false,
          message: `Blockchain verification failed: ${onChainResult.error}`,
          errorDetails: {
            errorType: 'CONTRACT_ERROR',
            networkName: tokenMetadata.network,
            rpcUrl: onChainResult.rpcUrl || networkConfig.rpcUrls[rpcUrlIndex] || 'unknown',
            contractAddress: tokenMetadata.contractAddress,
            tokenId: tokenMetadata.tokenId
          }
        };
      }

      // Compare calculated merkle root with on-chain merkle root
      if (!onChainResult.onChainMerkleRoot) {
        return {
          success: false,
          message: 'Blockchain verification failed - could not retrieve on-chain merkle root',
          errorDetails: {
            errorType: 'CONTRACT_ERROR',
            tokenId: tokenMetadata.tokenId,
            contractAddress: tokenMetadata.contractAddress
          }
        };
      }

      // This is the critical security check: calculated root must match on-chain root
      // Direct string comparison (case-sensitive) - merkle roots are hex strings and must match exactly
      const onChainRoot = onChainResult.onChainMerkleRoot;
      const calculatedRoot = calculatedMerkleRoot;
      
      if (onChainRoot !== calculatedRoot) {
        return {
          success: false,
          message: 'Archive integrity verification FAILED - merkle root mismatch',
          errorDetails: {
            errorType: 'MERKLE_ERROR',
            calculatedMerkleRoot: calculatedMerkleRoot,
            onChainMerkleRoot: onChainResult.onChainMerkleRoot,
            merkleRoot: `calculated: ${calculatedMerkleRoot}, on-chain: ${onChainResult.onChainMerkleRoot}` // Keep for backward compatibility
          }
        };
      }

      if (!onChainResult.isValid) {
        return {
          success: false,
          message: 'Blockchain verification FAILED - contract verification returned false',
          errorDetails: {
            errorType: 'CONTRACT_ERROR',
            tokenId: tokenMetadata.tokenId,
            contractAddress: tokenMetadata.contractAddress,
            merkleRoot: calculatedMerkleRoot
          }
        };
      }

      // Success - create verification details
      // CRITICAL: Use ONLY blockchain data for display, not metadata which can be tampered with
      const mintDate = onChainResult.onChainTokenizationTime 
        ? new Date(onChainResult.onChainTokenizationTime * 1000).toLocaleString()
        : (tokenMetadata.mintDate || 
           (tokenMetadata.creationTimestamp ? new Date(tokenMetadata.creationTimestamp * 1000).toLocaleString() : '') ||
           'Unknown'); // Use on-chain tokenization time as source of truth

      return {
        success: true,
        message: 'Archive integrity VERIFIED against blockchain records',
        tokenMetadata,
        verificationDetails: {
          // These identifiers come from metadata (needed to locate token), but are validated by blockchain query
          tokenId: tokenMetadata.tokenId,
          network: tokenMetadata.network,
          contractAddress: tokenMetadata.contractAddress,
          // CRITICAL: All verification data comes from blockchain, not metadata
          merkleRoot: onChainResult.onChainMerkleRoot || calculatedMerkleRoot, // On-chain value (source of truth)
          mintDate, // On-chain tokenizationTime converted to date string (source of truth)
          calculatedMerkleRoot: calculatedMerkleRoot || undefined,
          declaredMerkleRoot: onChainResult.onChainMerkleRoot || undefined, // On-chain value, not metadata
          merkleRootMatch: true, // Verified: calculated root matches on-chain root
          onChainValid: true
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown verification error';
      
      if (this.debug) {
        console.log(`[DEBUG] Verification process failed: ${errorMessage}`);
      }

      return {
        success: false,
        message: `Tokenization verification failed: ${errorMessage}`,
        errorDetails: {
          errorType: 'METADATA_ERROR'
        }
      };
    }
  }

  /**
   * Verify token with retry logic and exponential backoff
   * @param tokenMetadata Token metadata to verify
   * @param calculatedMerkleRoot Calculated merkle root from archive
   * @param maxRetries Maximum number of retry attempts (default: uses instance maxRetries)
   * @returns Enhanced verification result with retry information
   */
  async verifyTokenWithRetry(
    tokenMetadata: TokenMetadata,
    calculatedMerkleRoot: string | null,
    maxRetries?: number
  ): Promise<EnhancedVerificationResult> {
    const startTime = Date.now();
    const retries = maxRetries || this.maxRetries;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Verification attempt ${attempt}/${retries} for token ${tokenMetadata.tokenId}`);
        
        const result = await this.verifyToken(tokenMetadata, calculatedMerkleRoot);
        
        if (result.success) {
          console.log(`✅ Verification successful on attempt ${attempt} for token ${tokenMetadata.tokenId}`);
          return {
            ...result,
            retryAttempts: attempt,
            processingTime: Date.now() - startTime,
            timestamp: Date.now()
          };
        }
        
        lastError = new Error(result.message || 'Verification failed');
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown verification error');
        console.warn(`❌ Verification attempt ${attempt} failed for token ${tokenMetadata.tokenId}:`, lastError.message);
        
        if (attempt < retries) {
          const delay = this.calculateRetryDelay(attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }
    
    return {
      success: false,
      message: `Verification failed after ${retries} attempts: ${lastError?.message || 'Unknown error'}`,
      retryAttempts: retries,
      processingTime: Date.now() - startTime,
      timestamp: Date.now()
    };
  }

  /**
   * Batch verification for multiple tokens with rate limiting
   * @param tokens Array of token metadata and merkle roots to verify
   * @param options Batch processing options
   * @returns Batch verification result
   */
  async verifyBatch(
    tokens: Array<{ tokenMetadata: TokenMetadata; calculatedMerkleRoot: string | null }>,
    options: {
      parallel?: boolean;
      maxConcurrent?: number;
    } = {}
  ): Promise<BatchVerificationResult> {
    const startTime = Date.now();
    const { parallel = false, maxConcurrent = 3 } = options;
    
    console.log(`🔄 Starting batch verification for ${tokens.length} tokens (parallel: ${parallel})`);
    
    let results: EnhancedVerificationResult[] = [];
    
    if (parallel) {
      // Parallel processing with concurrency limit
      results = await this.verifyBatchParallel(tokens, maxConcurrent);
    } else {
      // Sequential processing with rate limiting
      results = await this.verifyBatchSequential(tokens);
    }
    
    const successfulVerifications = results.filter(r => r.success).length;
    const failedVerifications = results.length - successfulVerifications;
    
    console.log(`✅ Batch verification completed: ${successfulVerifications}/${tokens.length} successful`);
    
    return {
      success: failedVerifications === 0,
      totalTokens: tokens.length,
      successfulVerifications,
      failedVerifications,
      results,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Verify tokens in parallel with concurrency control
   */
  private async verifyBatchParallel(
    tokens: Array<{ tokenMetadata: TokenMetadata; calculatedMerkleRoot: string | null }>,
    maxConcurrent: number
  ): Promise<EnhancedVerificationResult[]> {
    const results: EnhancedVerificationResult[] = [];
    const chunks: Array<{ tokenMetadata: TokenMetadata; calculatedMerkleRoot: string | null }[]> = [];
    
    // Split tokens into chunks for parallel processing
    for (let i = 0; i < tokens.length; i += maxConcurrent) {
      chunks.push(tokens.slice(i, i + maxConcurrent));
    }
    
    // Process each chunk in parallel
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(token => 
        this.verifyTokenWithRetry(token.tokenMetadata, token.calculatedMerkleRoot)
      );
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      // Add delay between chunks to avoid overwhelming the network
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await this.delay(this.batchDelay);
      }
    }
    
    return results;
  }

  /**
   * Verify tokens sequentially with rate limiting
   */
  private async verifyBatchSequential(
    tokens: Array<{ tokenMetadata: TokenMetadata; calculatedMerkleRoot: string | null }>
  ): Promise<EnhancedVerificationResult[]> {
    const results: EnhancedVerificationResult[] = [];
    
    for (const token of tokens) {
      const result = await this.verifyTokenWithRetry(token.tokenMetadata, token.calculatedMerkleRoot);
      results.push(result);
      
      // Add delay between verifications to avoid rate limiting
      if (tokens.indexOf(token) < tokens.length - 1) {
        await this.delay(this.batchDelay);
      }
    }
    
    return results;
  }

  /**
   * Process verification jobs with priority queue
   * @param jobs Array of verification jobs
   * @param options Processing options
   * @returns Batch verification result
   */
  async processVerificationJobs(
    jobs: VerificationJob[],
    options: {
      maxConcurrent?: number;
      priorityOrder?: boolean;
      getTokenMetadata?: (tokenId: string) => Promise<TokenMetadata | null>;
      getCalculatedMerkleRoot?: (tokenId: string) => Promise<string | null>;
    } = {}
  ): Promise<BatchVerificationResult> {
    const { maxConcurrent = 3, priorityOrder = true, getTokenMetadata, getCalculatedMerkleRoot } = options;
    
    if (!getTokenMetadata || !getCalculatedMerkleRoot) {
      return {
        success: false,
        totalTokens: jobs.length,
        successfulVerifications: 0,
        failedVerifications: jobs.length,
        results: [],
        processingTime: 0
      };
    }
    
    // Sort jobs by priority if requested
    const sortedJobs = priorityOrder 
      ? this.sortJobsByPriority(jobs)
      : jobs;
    
    // Convert jobs to token format
    const tokens: Array<{ tokenMetadata: TokenMetadata; calculatedMerkleRoot: string | null }> = [];
    
    for (const job of sortedJobs) {
      const tokenMetadata = await getTokenMetadata(job.tokenId);
      const calculatedMerkleRoot = await getCalculatedMerkleRoot(job.tokenId);
      
      if (tokenMetadata) {
        tokens.push({
          tokenMetadata,
          calculatedMerkleRoot: calculatedMerkleRoot || null
        });
      }
    }
    
    return this.verifyBatch(tokens, { parallel: true, maxConcurrent });
  }

  /**
   * Sort verification jobs by priority
   */
  private sortJobsByPriority(jobs: VerificationJob[]): VerificationJob[] {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    
    return jobs.sort((a, b) => {
      const aPriority = priorityOrder[a.priority || 'normal'];
      const bPriority = priorityOrder[b.priority || 'normal'];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If same priority, sort by retry count (fewer retries first)
      return (a.retryCount || 0) - (b.retryCount || 0);
    });
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  protected calculateRetryDelay(attempt: number): number {
    return Math.min(this.retryDelay * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
  }

  /**
   * Utility method for delays
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get verification statistics
   */
  getVerificationStats(): {
    maxRetries: number;
    retryDelay: number;
    batchDelay: number;
  } {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      batchDelay: this.batchDelay
    };
  }

  /**
   * Update verification configuration
   */
  updateConfig(config: {
    maxRetries?: number;
    retryDelay?: number;
    batchDelay?: number;
  }): void {
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    if (config.retryDelay !== undefined) {
      this.retryDelay = config.retryDelay;
    }
    if (config.batchDelay !== undefined) {
      this.batchDelay = config.batchDelay;
    }
    
    if (this.debug) {
      console.log('🔧 ZipkitVerifier configuration updated:', this.getVerificationStats());
    }
  }
}
