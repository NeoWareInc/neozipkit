#!/usr/bin/env node

/**
 * ZipkitVerifier - Handles NFT token verification for ZIP files
 * Verifier API for NZIP-NFT smart contract.
 */

import { ethers } from 'ethers';
import { NZIP_CONTRACT_ABI, CONTRACT_CONFIGS, getContractConfig, getNetworkByName, fuzzyMatchNetworkName, type ContractConfig } from './contracts';
import type { TokenMetadata } from '../../types';

export interface VerificationOptions {
  debug?: boolean;
  skipHash?: boolean;
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
      // Check for META-INF/NZIP.TOKEN entry
      const tokenEntry = zipkit.getZipEntry('META-INF/NZIP.TOKEN');
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
      
      // Create normalized metadata object
      const metadata: TokenMetadata = {
        tokenId: rawMetadata.tokenId,
        contractAddress: rawMetadata.contractAddress,
        network: rawMetadata.network,
        networkChainId: chainId,
        merkleRoot: rawMetadata.merkleRoot,
        creationTimestamp: rawMetadata.blockNumber || rawMetadata.creationTimestamp,
        transactionHash: rawMetadata.transactionHash,
        ownerAddress: rawMetadata.ownerAddress,
        ...rawMetadata
      };
      
      // Validate required fields
      if (!metadata.tokenId || !metadata.contractAddress || !metadata.merkleRoot) {
        throw new Error('Invalid token metadata: missing required fields');
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
   * Extract and validate token metadata from ZIP
   */
  async extractTokenMetadata(tokenBuffer: Buffer): Promise<{ success: boolean; metadata?: TokenMetadata; error?: string }> {
    try {
      if (this.debug) {
        console.log(`[DEBUG] Extracting token metadata from buffer (${tokenBuffer.length} bytes)`);
      }

      const tokenData = JSON.parse(tokenBuffer.toString('utf8'));
      
      // Validate required fields
      const requiredFields = ['tokenId', 'contractAddress', 'network'];
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

      if (this.debug) {
        console.log(`[DEBUG] Token metadata extracted successfully`);
        console.log(`[DEBUG] Token ID: ${tokenData.tokenId}, Network: ${tokenData.network}`);
      }

      return { 
        success: true, 
        metadata: tokenData as TokenMetadata 
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
   * Supports both old metadata (without networkChainId) and new metadata (with networkChainId)
   */
  private getNetworkConfig(networkName: string, chainId?: number): { success: boolean; config?: ContractConfig; error?: string } {
    if (this.debug) {
      if (chainId) {
        console.log(`[DEBUG] Looking up network config by chainId: ${chainId} (network: ${networkName})`);
      } else {
        console.log(`[DEBUG] Looking up network config by name: ${networkName} (chainId not provided - using fallback)`);
      }
    }

    // Priority 1: If chainId is provided, use it directly (most reliable - new metadata format)
    if (chainId) {
      const config = getContractConfig(chainId);
      if (config && config.chainId === chainId) {
        if (this.debug) {
          console.log(`[DEBUG] Found config by chainId: ${config.network} (${config.chainId})`);
        }
        return { success: true, config };
      } else {
        if (this.debug) {
          console.log(`[DEBUG] ChainId ${chainId} not found in contract configs, falling back to network name`);
        }
      }
    }

    // Priority 2: Try exact name match using contracts.ts helpers
    const exactMatch = getNetworkByName(networkName);
    if (exactMatch) {
      if (this.debug) {
        console.log(`[DEBUG] Matched to ${exactMatch.network} (${exactMatch.chainId}) by network name`);
      }
      return { success: true, config: exactMatch };
    }

    // Priority 3: Try fuzzy matching (for backward compatibility with partial names)
    const fuzzyMatch = fuzzyMatchNetworkName(networkName);
    if (fuzzyMatch) {
      if (this.debug) {
        console.log(`[DEBUG] Fuzzy matched to ${fuzzyMatch.network} (${fuzzyMatch.chainId}) by network name`);
      }
      return { success: true, config: fuzzyMatch };
    }

    if (this.debug) {
      console.log(`[DEBUG] Unsupported network: ${networkName}`);
    }

    return { 
      success: false, 
      error: `Unsupported network: ${networkName}` 
    };
  }

  /**
   * Perform merkle root comparison
   */
  private compareMerkleRoots(calculated: string | null, declared: string | null): {
    success: boolean;
    match: boolean;
    calculated?: string;
    declared?: string;
    error?: string;
  } {
    if (this.debug) {
      console.log(`[DEBUG] Comparing merkle roots`);
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

    const match = calculated === declared;
    
    if (this.debug) {
      console.log(`[DEBUG] Merkle root match: ${match}`);
    }

    return {
      success: true,
      match,
      calculated,
      declared
    };
  }

  /**
   * Verify token against blockchain
   * @param rpcUrlIndex Optional index of RPC URL to use (default: 0)
   */
  async verifyOnChain(
    tokenId: string, 
    contractAddress: string, 
    networkConfig: ContractConfig, 
    merkleRoot: string,
    rpcUrlIndex: number = 0
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
    // Use specified RPC URL index
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
        console.log(`[DEBUG] Starting on-chain verification`);
        console.log(`[DEBUG] Token ID: ${tokenId}, Contract: ${contractAddress}`);
        console.log(`[DEBUG] Network: ${networkConfig.network}, Chain ID: ${networkConfig.chainId}`);
        console.log(`[DEBUG] Using RPC: ${rpcUrl}`);
      }

      provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);

      if (this.debug) {
        console.log(`[DEBUG] Calling contract.verifyZipFile(${tokenId}, ${merkleRoot.substring(0, 10)}...)`);
      }

      // First check if token exists and get ALL actual on-chain data (not from metadata)
      // Using minimal ABI that works with both v2.10 and v2.11 contracts
      let onChainMerkleRoot: string | undefined;
      let onChainTokenizationTime: number | undefined;
      let onChainCreator: string | undefined;
      let onChainBlockNumber: number | undefined;
      let onChainEncryptedHash: string | undefined;
      
      try {
        // Get token info including ALL data stored on-chain (merkle root, tokenization time, creator, block number)
        // CRITICAL: We trust ONLY blockchain data, not metadata file which can be tampered with
        // The ABI only declares the fields we need, so it works with both v2.10 and v2.11
        const zipFileInfo = await Promise.race([
          contract.getZipFileInfo(tokenId),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('getZipFileInfo timeout after 10 seconds')), 10000)
          )
        ]);
        
        // Extract all on-chain data (fields present in both v2.10 and v2.11)
        onChainMerkleRoot = zipFileInfo.merkleRootHash;
        onChainTokenizationTime = Number(zipFileInfo.tokenizationTime);
        onChainCreator = zipFileInfo.creator;
        onChainBlockNumber = Number(zipFileInfo.blockNumber);
        
        // Note: We're not reading encryptedHash since our ABI doesn't declare it
        // This keeps the code simple and works with both contract versions
        onChainEncryptedHash = undefined;
        
        if (this.debug) {
          console.log(`[DEBUG] Token ${tokenId} exists`);
          console.log(`[DEBUG] On-chain merkle root: ${onChainMerkleRoot}`);
          console.log(`[DEBUG] On-chain tokenization time: ${onChainTokenizationTime} (${new Date(onChainTokenizationTime * 1000).toLocaleString()})`);
          console.log(`[DEBUG] On-chain creator: ${onChainCreator}`);
          console.log(`[DEBUG] On-chain block number: ${onChainBlockNumber}`);
          console.log(`[DEBUG] Calculated merkle root: ${merkleRoot}`);
        }
      } catch (infoError: any) {
        const errorMsg = infoError.message || String(infoError);
        if (this.debug) {
          console.log(`[DEBUG] Token info check failed: ${errorMsg}`);
        }
        // If token doesn't exist, return error
        if (errorMsg.includes('nonexistent token') || errorMsg.includes('ERC721: invalid token ID')) {
          return {
            success: false,
            error: `Token ${tokenId} does not exist on contract ${contractAddress}`
          };
        }
        // For other errors, fail immediately
        return {
          success: false,
          error: `Failed to get token info: ${errorMsg}`
        };
      }

      // Compare the calculated merkle root with the on-chain merkle root
      // This is the critical security check - we trust the blockchain, not the metadata file
      const merkleRootMatch = onChainMerkleRoot && onChainMerkleRoot.toLowerCase() === merkleRoot.toLowerCase();
      
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

      // Perform on-chain verification - this will fetch the actual merkle root from the blockchain
      const onChainResult = await this.verifyOnChain(
        tokenMetadata.tokenId,
        tokenMetadata.contractAddress,
        networkConfig,
        calculatedMerkleRoot,
        rpcUrlIndex
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
      const onChainRoot = onChainResult.onChainMerkleRoot.toLowerCase();
      const calculatedRoot = calculatedMerkleRoot.toLowerCase();
      
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
