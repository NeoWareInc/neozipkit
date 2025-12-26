// ======================================
//	TokenVerifierBrowser.ts
//  Browser-compatible blockchain token verification utilities for ZIP archives
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================

import ZipkitBrowser from '../../browser/ZipkitBrowser';
import { ZipEntry } from '../../core';
import { TOKENIZED_METADATA } from '../../core/constants/Headers';
import { TokenMetadata } from '../../types';
import { NZIP_CONTRACT_ABI, getContractConfig } from '../core/contracts';
import { ethers } from 'ethers';

export interface TokenVerificationOptions {
  skipHash?: boolean;
  skipToken?: boolean;
  generateCertificate?: boolean;
  zipFileName?: string;
}

export interface TokenVerificationResult {
  isTokenized: boolean;
  tokenMetadata: TokenMetadata | null;
  calculatedMerkleRoot: string | null;
  blockchainMerkleRoot: string | null;
  blockchainTimestamp?: number; // Actual blockchain timestamp from tokenizationTime
  verificationPassed: boolean;
  certificatePath?: string;
  errorMessage?: string;
}

export interface BlockchainVerification {
  merkleRootMatches: boolean;
  blockchainMerkleRoot: string;
  calculatedMerkleRoot: string;
  verificationStatus: 'PASSED' | 'FAILED' | 'UNAVAILABLE';
  verificationTime?: number;
  blockNumber?: number;
}

// Use the complete contract ABI from constants
const CONTRACT_ABI = NZIP_CONTRACT_ABI;

/**
 * Browser-compatible token verification class
 */
export class TokenVerifierBrowser {
  private zipkit: ZipkitBrowser;

  constructor(zipkit: ZipkitBrowser) {
    this.zipkit = zipkit;
  }

  /**
   * Checks if the ZIP file contains NFT token metadata and verifies the merkle root
   */
  async checkForTokenization(
    zipEntries: ZipEntry[],
    options: TokenVerificationOptions = {}
  ): Promise<TokenVerificationResult> {
      // Look for the tokenized metadata file
  const tokenEntry = zipEntries.find(entry => entry.filename === TOKENIZED_METADATA);
    
    if (!tokenEntry) {
      return {
        isTokenized: false,
        tokenMetadata: null,
        calculatedMerkleRoot: null,
        blockchainMerkleRoot: null,
        verificationPassed: false
      };
    }

    try {
      // Extract the token metadata
      const tokenData = await this.zipkit.extractBlob(tokenEntry);
      
      if (!tokenData) {
        return {
          isTokenized: false,
          tokenMetadata: null,
          calculatedMerkleRoot: null,
          blockchainMerkleRoot: null,
          verificationPassed: false,
          errorMessage: 'Could not read token metadata'
        };
      }

      const tokenContent = await this.blobToString(tokenData);
      const tokenMetadata = JSON.parse(tokenContent);
      
      // Validate token metadata structure
      if (!this.validateTokenInfo(tokenMetadata)) {
        return {
          isTokenized: false,
          tokenMetadata: null,
          calculatedMerkleRoot: null,
          blockchainMerkleRoot: null,
          verificationPassed: false,
          errorMessage: 'Invalid token metadata structure'
        };
      }

      // Skip verification if requested
      if (options.skipHash || options.skipToken) {
        return {
          isTokenized: true,
          tokenMetadata,
          calculatedMerkleRoot: null,
          blockchainMerkleRoot: null,
          verificationPassed: false,
          errorMessage: options.skipHash ? 'Hash verification skipped' : 'Token verification skipped'
        };
      }

      // Calculate merkle root excluding token file
      const calculatedMerkleRoot = await this.calculateMerkleRootExcludingToken(zipEntries);
      
      if (!calculatedMerkleRoot) {
        return {
          isTokenized: true,
          tokenMetadata,
          calculatedMerkleRoot: null,
          blockchainMerkleRoot: null,
          verificationPassed: false,
          errorMessage: 'Could not calculate merkle root'
        };
      }

      // Query blockchain for the actual merkle root and timestamp
      const blockchainData = await this.queryBlockchainData(tokenMetadata);
      
      if (!blockchainData.merkleRoot) {
        // Add owner information to tokenMetadata even if merkle root is not available
        const enhancedTokenMetadata = {
          ...tokenMetadata,
          owner: blockchainData.owner || undefined
        };
        
        return {
          isTokenized: true,
          tokenMetadata: enhancedTokenMetadata,
          calculatedMerkleRoot,
          blockchainMerkleRoot: null,
          blockchainTimestamp: blockchainData.timestamp ?? undefined,
          verificationPassed: false,
          errorMessage: 'Could not retrieve merkle root from blockchain'
        };
      }

      // Normalize both merkle roots for comparison (trim whitespace, lowercase)
      const normalizedBlockchain = blockchainData.merkleRoot?.toLowerCase().trim() || '';
      const normalizedCalculated = calculatedMerkleRoot?.toLowerCase().trim() || '';
      const verificationPassed = normalizedBlockchain === normalizedCalculated;
      
      // Add owner information to tokenMetadata
      const enhancedTokenMetadata = {
        ...tokenMetadata,
        owner: blockchainData.owner || undefined
      };
      
      return {
        isTokenized: true,
        tokenMetadata: enhancedTokenMetadata,
        calculatedMerkleRoot,
        blockchainMerkleRoot: blockchainData.merkleRoot,
        blockchainTimestamp: blockchainData.timestamp ?? undefined,
        verificationPassed,
        errorMessage: verificationPassed ? undefined : `Merkle root mismatch - Calculated: ${calculatedMerkleRoot}, Blockchain: ${blockchainData.merkleRoot}`
      };
      
    } catch (error) {
      return {
        isTokenized: false,
        tokenMetadata: null,
        calculatedMerkleRoot: null,
        blockchainMerkleRoot: null,
        verificationPassed: false,
        errorMessage: `Error processing token: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validates token metadata structure
   * Validates required fields: tokenId, contractAddress, network, merkleRoot, networkChainId, contractVersion
   */
  private validateTokenInfo(tokenMetadata: any): tokenMetadata is TokenMetadata {
    // Check basic structure
    if (!tokenMetadata || typeof tokenMetadata !== 'object') {
      return false;
    }
    
    // Required core fields
    if (typeof tokenMetadata.tokenId !== 'string' || !tokenMetadata.tokenId) {
      return false;
    }
    if (typeof tokenMetadata.contractAddress !== 'string' || !tokenMetadata.contractAddress) {
      return false;
    }
    if (typeof tokenMetadata.network !== 'string' || !tokenMetadata.network) {
      return false;
    }
    if (typeof tokenMetadata.merkleRoot !== 'string' || !tokenMetadata.merkleRoot) {
      return false;
    }
    
    // Required version fields (new requirement)
    if (typeof tokenMetadata.networkChainId !== 'number' || tokenMetadata.networkChainId === undefined) {
      return false;
    }
    if (typeof tokenMetadata.contractVersion !== 'string' || !tokenMetadata.contractVersion) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculates the merkle root excluding the token metadata file
   */
  private async calculateMerkleRootExcludingToken(zipEntries: ZipEntry[]): Promise<string | null> {
    try {
      // Get all entries except the token file
      const contentEntries = zipEntries.filter(entry => entry.filename !== TOKENIZED_METADATA);
      
      if (contentEntries.length === 0) {
        console.error(`[TokenVerifier] ❌ No content entries found after filtering`);
        return null;
      }

      // For each content entry, ensure we have SHA-256 hash calculated
      for (const entry of contentEntries) {
        if (!entry.sha256) {
          // Extract the file to calculate its SHA-256 hash
          await this.zipkit.extractBlob(entry);
        }
      }

      // Calculate merkle root from content files
      // getMerkleRoot() already excludes TOKENIZED_METADATA, TIMESTAMP_SUBMITTED, and TIMESTAMP_METADATA
      const merkleRoot = await this.zipkit.getMerkleRoot?.() || null;
      
      if (!merkleRoot) {
        console.error(`[TokenVerifier] ❌ Failed to calculate merkle root`);
      }
      
      return merkleRoot;
    } catch (error) {
      console.error(`[TokenVerifier] ❌ Error calculating merkle root:`, error);
      return null;
    }
  }

  /**
   * Queries the blockchain to get the actual merkle root, timestamp, and owner stored in the smart contract
   */
  private async queryBlockchainData(tokenMetadata: TokenMetadata): Promise<{merkleRoot: string | null, timestamp: number | null, owner: string | null}> {
    try {
      // Get network configuration from contracts.ts (single source of truth)
      if (!tokenMetadata.networkChainId) {
        console.error(`[TokenVerifier] ❌ No chainId in token metadata`);
        return { merkleRoot: null, timestamp: null, owner: null };
      }
      
      const networkConfig = getContractConfig(tokenMetadata.networkChainId);
      
      if (!networkConfig) {
        console.error(`[TokenVerifier] ❌ Could not resolve network configuration for chainId: ${tokenMetadata.networkChainId}`);
        return { merkleRoot: null, timestamp: null, owner: null };
      }

      // Test RPC endpoints first to find working ones (same as server-side)
      const workingRpcUrls: string[] = [];
      
      for (const rpcUrl of networkConfig.rpcUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const testResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_chainId',
              params: [],
              id: 1
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (testResponse.ok) {
            const contentType = testResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const testData = await testResponse.json() as { jsonrpc?: string; result?: string };
              if (testData?.jsonrpc && testData?.result) {
                const actualChainId = parseInt(testData.result, 16);
                if (actualChainId === tokenMetadata.networkChainId) {
                  workingRpcUrls.push(rpcUrl);
                }
              }
            }
          }
        } catch (testError: any) {
          // Silently skip failed endpoints
        }
      }
      
      if (workingRpcUrls.length === 0) {
        // Fallback to all endpoints if none tested successfully
        workingRpcUrls.push(...networkConfig.rpcUrls);
      }

      // Try multiple RPC endpoints (only working ones if available)
      for (let i = 0; i < workingRpcUrls.length; i++) {
        const rpcUrl = workingRpcUrls[i];
        
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          
          // Test connection with a timeout
          await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);

          // Create contract instance
          const contract = new ethers.Contract(tokenMetadata.contractAddress, CONTRACT_ABI, provider);
          
          // Call getZipFileInfo to get the blockchain-stored data
          // Using minimal ABI that works with both v2.10 and v2.11 contracts
          const zipInfo = await contract.getZipFileInfo(tokenMetadata.tokenId);
          
          // Get the token owner
          const owner = await contract.ownerOf(tokenMetadata.tokenId);
          
          // Extract merkle root and timestamp (fields present in both v2.10 and v2.11)
          const merkleRoot = zipInfo.merkleRootHash;
          const timestamp = Number(zipInfo.tokenizationTime);
          
          return {
            merkleRoot: merkleRoot,
            timestamp: timestamp,
            owner: owner
          };
          
        } catch (error: any) {
          // Continue to next endpoint on error
          continue;
        }
      }
      
      console.error(`[TokenVerifier] ❌ All RPC endpoints failed for network: ${tokenMetadata.network}`);
      return { merkleRoot: null, timestamp: null, owner: null };
      
    } catch (error: any) {
      console.error(`[TokenVerifier] ❌ Blockchain query error:`, error?.message || error);
      return { merkleRoot: null, timestamp: null, owner: null };
    }
  }

  /**
   * Helper to convert Blob to string
   */
  private async blobToString(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  }

  /**
   * Creates a formatted summary of token information
   */
  createTokenSummary(tokenMetadata: TokenMetadata): string {
    return `
🎫 NFT Token Information:
   Token ID: ${tokenMetadata.tokenId}
   Network: ${tokenMetadata.network}
   Contract: ${tokenMetadata.contractAddress}
   Transaction: ${tokenMetadata.transactionHash}
    Type: Tokenized Archive
   Minted: ${tokenMetadata.mintedAt ? new Date(tokenMetadata.mintedAt).toLocaleString() : 'Unknown'}
   `;
  }
}

/**
 * Creates a new TokenVerifierBrowser instance
 */
export function createTokenVerifier(zipkit: ZipkitBrowser): TokenVerifierBrowser {
  return new TokenVerifierBrowser(zipkit);
}

/**
 * Convenience function to check for tokenization
 */
export async function checkForTokenization(
  zipkit: ZipkitBrowser,
  zipEntries: ZipEntry[],
  options: TokenVerificationOptions = {}
): Promise<TokenVerificationResult> {
  const verifier = new TokenVerifierBrowser(zipkit);
  return verifier.checkForTokenization(zipEntries, options);
} 