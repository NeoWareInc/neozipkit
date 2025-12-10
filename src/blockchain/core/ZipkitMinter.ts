#!/usr/bin/env node

/**
 * ZipkitMinter - Handles NFT token minting for ZIP files
 * Minter API for NZIP-NFT smart contract.
 */

import { ethers } from 'ethers';
import { NZIP_CONTRACT_ABI, CONTRACT_CONFIGS, getContractConfig, getChainIdByName, getSupportedNetworkNames, type ContractConfig } from './contracts';
import type { TokenMetadata } from '../../types';

export interface MintingOptions {
  walletPrivateKey: string;
  network: string;
  verbose?: boolean;
  debug?: boolean;
  rpcUrlIndex?: number; // RPC URL index to use (default: 0)
}

export interface MintingResult {
  success: boolean;
  message: string;
  tokenId?: string;
  transactionHash?: string;
  contractAddress?: string;
  blockNumber?: number;
  walletAddress?: string;
  gasUsed?: string;
  gasCost?: string;
}

export interface TokenInfo {
  tokenId: string;
  owner: string;
  isOwnedByUser: boolean;
  tokenData?: any;
}

export interface DuplicateCheckResult {
  hasExistingTokens: boolean;
  allTokens: TokenInfo[];
  userOwnedTokens: TokenInfo[];
  othersTokens: TokenInfo[];
}

export interface WalletInfo {
  address: string;
  balance: string;
  networkName: string;
}

/**
 * Blockchain Token Minter for ZIP files
 * 
 * SECURITY WARNING: This class handles private keys for blockchain operations.
 * - Never hardcode private keys in source code
 * - Always use environment variables for private keys (e.g., NEOZIP_WALLET_PASSKEY)
 * - Use testnet keys for development/testing
 * - Use secure key management (HSMs, KMS) for production
 * - See SECURITY.md for complete security guidelines
 */
export class ZipkitMinter {
  protected provider: ethers.JsonRpcProvider;
  protected wallet: ethers.Wallet;
  protected contract: ethers.Contract;
  protected merkleRoot: string;
  protected encryptedHash: string;  // Hash of encrypted ZIP file (v3.0+)
  protected networkConfig: ContractConfig;
  protected debug: boolean;
  protected rpcUrlIndex: number;
  
  constructor(merkleRoot: string, options: MintingOptions & { encryptedHash?: string }) {
    this.merkleRoot = merkleRoot;
    this.encryptedHash = options.encryptedHash || '';
    this.debug = options.debug || false;
    this.rpcUrlIndex = options.rpcUrlIndex ?? 0;
    
    // Get chain ID from network name using contracts.ts (single source of truth)
    const chainId = getChainIdByName(options.network);
    if (!chainId) {
      const supported = getSupportedNetworkNames().join(', ');
      throw new Error(`Unsupported network: ${options.network}. Supported networks: ${supported}`);
    }
    
    // Get network configuration from contracts.ts
    this.networkConfig = getContractConfig(chainId);
    
    if (this.networkConfig.rpcUrls.length === 0) {
      throw new Error(`No RPC URLs configured for network: ${options.network} (chainId: ${chainId})`);
    }
    
    // Validate RPC URL index
    if (this.rpcUrlIndex < 0 || this.rpcUrlIndex >= this.networkConfig.rpcUrls.length) {
      throw new Error(`RPC URL index ${this.rpcUrlIndex} is out of range. Available RPCs: ${this.networkConfig.rpcUrls.length}`);
    }
    
    // Use specified RPC URL index
    const rpcUrl = this.networkConfig.rpcUrls[this.rpcUrlIndex];
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    if (this.debug) {
      console.log(`[DEBUG] Using RPC URL index ${this.rpcUrlIndex}: ${rpcUrl}`);
      console.log(`[DEBUG] Available RPC URLs: ${this.networkConfig.rpcUrls.length}`);
    }
    
    // Initialize wallet from private key
    // SECURITY: Private key should come from environment variable, never hardcoded
    this.wallet = new ethers.Wallet(options.walletPrivateKey, this.provider);
    
    // Initialize contract instance
    this.contract = new ethers.Contract(
      this.networkConfig.address,
      NZIP_CONTRACT_ABI,
      this.wallet
    );

    if (this.debug) {
      console.log(`[DEBUG] ZipkitMinter initialized for ${this.networkConfig.network}`);
      console.log(`[DEBUG] Chain ID: ${this.networkConfig.chainId}`);
      console.log(`[DEBUG] Contract Address: ${this.networkConfig.address}`);
      console.log(`[DEBUG] Merkle Root: ${merkleRoot.substring(0, 10)}...`);
    }
  }

  /**
   * Get wallet information
   */
  async getWalletInfo(): Promise<WalletInfo> {
    const balance = await this.provider.getBalance(this.wallet.address);
    const balanceInEth = ethers.formatEther(balance);
    
    if (this.debug) {
      console.log(`[DEBUG] Wallet ${this.wallet.address} balance: ${balanceInEth} ETH`);
    }
    
    return {
      address: this.wallet.address,
      balance: balanceInEth,
      networkName: this.networkConfig.network
    };
  }

  /**
   * Check for existing tokens with same merkle root and verify ownership
   */
  async checkForDuplicates(): Promise<DuplicateCheckResult> {
    try {
      if (this.debug) {
        console.log(`[DEBUG] Checking for existing tokens with merkle root: ${this.merkleRoot}`);
        console.log(`[DEBUG] User wallet address: ${this.wallet.address}`);
      }

      // Call contract method to check if merkle root already exists
      const existingTokenIds = await this.contract.getTokensByMerkleRoot(this.merkleRoot);
      
      if (!existingTokenIds || existingTokenIds.length === 0) {
        if (this.debug) {
          console.log(`[DEBUG] No existing tokens found for this merkle root`);
        }
        return {
          hasExistingTokens: false,
          allTokens: [],
          userOwnedTokens: [],
          othersTokens: []
        };
      }

      if (this.debug) {
        console.log(`[DEBUG] Found ${existingTokenIds.length} existing token(s)`);
      }

      // Check ownership and get token details for each token
      const allTokens: TokenInfo[] = [];
      const userOwnedTokens: TokenInfo[] = [];
      const othersTokens: TokenInfo[] = [];

      for (const tokenId of existingTokenIds) {
        const tokenIdStr = tokenId.toString();
        
        try {
          // Get token owner
          const owner = await this.contract.ownerOf(tokenId);
          const isOwnedByUser = owner.toLowerCase() === this.wallet.address.toLowerCase();
          
          // Get token data
          let tokenData = null;
          try {
            tokenData = await this.contract.getZipFileInfo(tokenId);
          } catch (e) {
            if (this.debug) {
              console.log(`[DEBUG] Could not get token data for ${tokenIdStr}: ${e}`);
            }
          }

          const tokenInfo: TokenInfo = {
            tokenId: tokenIdStr,
            owner: owner,
            isOwnedByUser: isOwnedByUser,
            tokenData: tokenData
          };

          allTokens.push(tokenInfo);
          
          if (isOwnedByUser) {
            userOwnedTokens.push(tokenInfo);
            if (this.debug) {
              console.log(`[DEBUG] Token ${tokenIdStr} is owned by user`);
            }
          } else {
            othersTokens.push(tokenInfo);
            if (this.debug) {
              console.log(`[DEBUG] Token ${tokenIdStr} is owned by ${owner}`);
            }
          }

        } catch (e) {
          if (this.debug) {
            console.log(`[DEBUG] Error checking ownership for token ${tokenIdStr}: ${e}`);
          }
        }
      }

      return {
        hasExistingTokens: true,
        allTokens,
        userOwnedTokens,
        othersTokens
      };
      
    } catch (error) {
      if (this.debug) {
        console.log(`[DEBUG] Error checking duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // If the contract method doesn't exist or fails, assume no duplicates
      return {
        hasExistingTokens: false,
        allTokens: [],
        userOwnedTokens: [],
        othersTokens: []
      };
    }
  }

  /**
   * Estimate gas costs for minting
   */
  async estimateGasCosts(): Promise<{ gasLimit: bigint; gasPrice: bigint; estimatedCost: string }> {
    const creationTimestamp = Math.floor(Date.now() / 1000);
    const metadata = this.createTokenMetadataString();

    // v2.11 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
    const gasLimit = await this.contract.publicMintZipFile.estimateGas(
      this.merkleRoot,
      this.encryptedHash || '', // encryptedHash (empty string if not provided)
      creationTimestamp,
      '', // ipfsHash
      metadata
    );

    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    const estimatedCost = ethers.formatEther(gasLimit * gasPrice);

    if (this.debug) {
      console.log(`[DEBUG] Gas estimate - Limit: ${gasLimit}, Price: ${gasPrice}, Cost: ${estimatedCost} ETH`);
    }

    return { gasLimit, gasPrice, estimatedCost };
  }

  /**
   * Create token metadata string
   */
  private createTokenMetadataString(): string {
    const now = new Date();
    return JSON.stringify({
      name: `NeoZip Archive`,
      description: `Tokenized ZIP archive with cryptographic proof of integrity`,
      image: '', // Could be a thumbnail or icon
      merkleRoot: this.merkleRoot,
      network: this.networkConfig.network,
      createdAt: now.toISOString(),
      timestamp: Math.floor(now.getTime() / 1000)
    });
  }

  /**
   * Create TokenMetadata object from minting result
   */
  private createTokenMetadata(tokenId: string, transactionHash: string, blockNumber?: number): TokenMetadata {
    const now = new Date();
    
    return {
      tokenId,
      network: this.networkConfig.network,
      networkChainId: this.networkConfig.chainId,
      contractAddress: this.networkConfig.address,
      merkleRoot: this.merkleRoot,
      encryptedHash: this.encryptedHash || undefined,  // Include encrypted hash if present
      mintDate: now.toLocaleDateString('en-US') + ' at ' + now.toLocaleTimeString('en-US'),
      creationTimestamp: Math.floor(now.getTime() / 1000),
      transactionHash,
      blockNumber
    };
  }

  /**
   * Mint new token on blockchain
   */
  async mintToken(): Promise<MintingResult> {
    try {
      if (this.debug) {
        console.log(`[DEBUG] Starting token minting process`);
      }

      // Generate token ID (could be random or sequential)
      const tokenId = Math.floor(Math.random() * 1000000).toString();
      const metadata = this.createTokenMetadataString();
      const creationTimestamp = Math.floor(Date.now() / 1000);

      if (this.debug) {
        console.log(`[DEBUG] Generated token ID: ${tokenId}`);
        console.log(`[DEBUG] Metadata: ${metadata.substring(0, 100)}...`);
      }

      // Estimate gas first (with timeout)
      if (this.debug) {
        console.log(`[DEBUG] Estimating gas for transaction...`);
      }
      
      let gasLimit: bigint;
      let gasPrice: bigint;
      try {
        // v2.11 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
        const gasEstimate = await Promise.race([
          this.contract.publicMintZipFile.estimateGas(
            this.merkleRoot,
            this.encryptedHash || '', // encryptedHash (empty string if not provided)
            creationTimestamp,
            '', // ipfsHash
            metadata
          ),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Gas estimation timeout after 20 seconds')), 20000)
          )
        ]);
        
        // Add 20% buffer to gas estimate
        gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);
        
        // Get current gas price
        const feeData = await Promise.race([
          this.provider.getFeeData(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Gas price fetch timeout after 10 seconds')), 10000)
          )
        ]);
        gasPrice = feeData.gasPrice || feeData.maxFeePerGas || BigInt(0);
        
        if (gasPrice === BigInt(0)) {
          throw new Error('Could not get gas price from network');
        }
        
        const estimatedCost = ethers.formatEther(gasLimit * gasPrice);
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceEth = ethers.formatEther(balance);
        
        if (this.debug) {
          console.log(`[DEBUG] Gas estimate: ${gasLimit.toString()}`);
          console.log(`[DEBUG] Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
          console.log(`[DEBUG] Estimated cost: ${estimatedCost} ETH`);
          console.log(`[DEBUG] Wallet balance: ${balanceEth} ETH`);
        }
        
        // Check if we have enough balance
        if (balance < gasLimit * gasPrice) {
          throw new Error(`Insufficient balance. Need ${estimatedCost} ETH, have ${balanceEth} ETH`);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Gas estimation failed';
        if (this.debug) {
          console.log(`[DEBUG] Gas estimation failed: ${errorMessage}`);
        }
        throw new Error(`Gas estimation failed: ${errorMessage}`);
      }
      
      // Call the contract publicMintZipFile function with explicit gas parameters
      if (this.debug) {
        console.log(`[DEBUG] Submitting transaction with gas limit: ${gasLimit.toString()}, gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
      }
      
      // v2.11 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
      const tx = await Promise.race([
        this.contract.publicMintZipFile(
          this.merkleRoot,
          this.encryptedHash || '', // encryptedHash (empty string if not provided)
          creationTimestamp,
          '', // ipfsHash (empty since we store in ZIP)
          metadata,
          {
            gasLimit: gasLimit,
            gasPrice: gasPrice
          }
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction submission timeout after 30 seconds')), 30000)
        )
      ]);

      if (this.debug) {
        console.log(`[DEBUG] Transaction submitted: ${tx.hash}`);
        process.stdout.write(`[DEBUG] Waiting for confirmation (timeout: 120s)`);
      } else {
        // Show waiting message for non-debug mode
        process.stdout.write('⏳ Waiting for confirmation');
      }

      // Animated waiting dots (first dot immediately, then one every 2 seconds)
      let dotCount = 0;
      process.stdout.write('.'); // Show first dot immediately
      dotCount++;
      
      const dotInterval = setInterval(() => {
        dotCount++;
        process.stdout.write('.');
        if (dotCount >= 60) { // Max 60 dots (120 seconds)
          clearInterval(dotInterval);
        }
      }, 2000);

      // Wait for transaction confirmation with timeout
      let receipt: any;
      try {
        receipt = await Promise.race([
          tx.wait(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Transaction confirmation timeout after 120 seconds')), 120000)
          )
        ]);
        
        clearInterval(dotInterval);
        if (dotCount > 0) {
          console.log(''); // New line after dots
        }
      } catch (error) {
        clearInterval(dotInterval);
        if (dotCount > 0) {
          console.log(''); // New line after dots
        }
        throw error;
      }

      if (this.debug) {
        console.log(`[DEBUG] Transaction confirmed in block: ${receipt.blockNumber}`);
        console.log(`[DEBUG] Gas used: ${receipt.gasUsed}`);
      }

      // Extract actual token ID from contract events
      let actualTokenId = tokenId; // fallback
      
      if (receipt.logs && receipt.logs.length > 0) {
        try {
          const iface = new ethers.Interface(NZIP_CONTRACT_ABI);
          for (const log of receipt.logs) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed?.name === 'ZipFileTokenized') {
                actualTokenId = parsed.args.tokenId.toString();
                if (this.debug) {
                  console.log(`[DEBUG] Actual token ID from contract event: ${actualTokenId}`);
                }
                break;
              }
            } catch (e) {
              // Ignore parsing errors for non-matching logs
            }
          }
        } catch (e) {
          if (this.debug) {
            console.log(`[DEBUG] Could not parse token ID from logs: ${e}`);
          }
        }
      }

      const gasCost = ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || BigInt(0)));

      return {
        success: true,
        message: `Token successfully minted`,
        tokenId: actualTokenId,
        transactionHash: tx.hash,
        contractAddress: this.networkConfig.address,
        blockNumber: receipt.blockNumber,
        walletAddress: this.wallet.address,
        gasUsed: receipt.gasUsed.toString(),
        gasCost
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown minting error';
      
      if (this.debug) {
        console.log(`[DEBUG] Minting failed: ${errorMessage}`);
      }

      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Main minting process - checks for duplicates, then mints if needed
   */
  async processMinting(): Promise<{
    walletInfo: WalletInfo;
    duplicateCheck: DuplicateCheckResult;
    gasCosts?: { gasLimit: bigint; gasPrice: bigint; estimatedCost: string };
    mintingResult?: MintingResult;
    tokenMetadata?: TokenMetadata;
  }> {
    try {
      // Get wallet information
      const walletInfo = await this.getWalletInfo();

      // Check for duplicates first (free operation)
      const duplicateCheck = await this.checkForDuplicates();

      if (duplicateCheck.hasExistingTokens) {
        if (this.debug) {
          console.log(`[DEBUG] Existing tokens found, user will choose`);
        }
        
        return {
          walletInfo,
          duplicateCheck
        };
      }

      // Estimate gas costs
      const gasCosts = await this.estimateGasCosts();

      // This is where the user would be prompted for confirmation in the calling code
      // The actual minting happens in a separate call to mintToken()

      return {
        walletInfo,
        duplicateCheck,
        gasCosts
      };

    } catch (error) {
      throw new Error(`Minting process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Complete the minting after user confirmation
   */
  async completeMinting(): Promise<{
    mintingResult: MintingResult;
    tokenMetadata?: TokenMetadata;
  }> {
    const mintingResult = await this.mintToken();

    if (mintingResult.success && mintingResult.tokenId && mintingResult.transactionHash) {
      const tokenMetadata = this.createTokenMetadata(
        mintingResult.tokenId,
        mintingResult.transactionHash,
        mintingResult.blockNumber
      );

      return {
        mintingResult,
        tokenMetadata
      };
    }

    return { mintingResult };
  }

  /**
   * Switch to a different RPC URL by index
   * This recreates the provider, wallet, and contract with the new RPC
   */
  switchRpcUrl(newIndex: number): void {
    if (newIndex < 0 || newIndex >= this.networkConfig.rpcUrls.length) {
      throw new Error(`RPC URL index ${newIndex} is out of range. Available RPCs: ${this.networkConfig.rpcUrls.length}`);
    }
    
    // Destroy old provider
    if (this.provider) {
      try {
        this.provider.destroy();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    
    // Update RPC index
    this.rpcUrlIndex = newIndex;
    const rpcUrl = this.networkConfig.rpcUrls[this.rpcUrlIndex];
    
    // Create new provider
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Recreate wallet with new provider
    this.wallet = new ethers.Wallet(this.wallet.privateKey, this.provider);
    
    // Recreate contract with new provider
    this.contract = new ethers.Contract(
      this.networkConfig.address,
      NZIP_CONTRACT_ABI,
      this.wallet
    );
    
    if (this.debug) {
      console.log(`[DEBUG] Switched to RPC URL index ${this.rpcUrlIndex}: ${rpcUrl}`);
    }
  }

  /**
   * Destroy provider to allow process to exit
   */
  destroy(): void {
    try {
      if (this.provider) {
        // Destroy the provider to close connections and allow process to exit
        // Safe to call multiple times - ethers.js handles idempotency
        this.provider.destroy();
        if (this.debug) {
          console.log('[DEBUG] Provider destroyed');
        }
      }
    } catch (error) {
      if (this.debug) {
        console.log(`[DEBUG] Error destroying provider: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Mint token with retry logic and exponential backoff
   * @param maxRetries Maximum number of retry attempts (default: 3)
   * @returns Minting result with retry information
   */
  async mintTokenWithRetry(maxRetries: number = 3): Promise<MintingResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Minting attempt ${attempt}/${maxRetries}`);
        const result = await this.mintToken();
        
        if (result.success) {
          console.log(`✅ Minting successful on attempt ${attempt}`);
          return result;
        }
        
        lastError = new Error(result.message || 'Minting failed');
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`❌ Minting attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return {
      success: false,
      message: `Minting failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    };
  }

  /**
   * Batch minting for multiple archives
   * @param archives Array of archive objects with name and merkleRoot
   * @returns Array of minting results
   */
  async mintBatch(archives: Array<{ name: string; merkleRoot: string }>): Promise<MintingResult[]> {
    const results: MintingResult[] = [];
    
    for (const archive of archives) {
      try {
        // Update the merkle root for this archive
        this.merkleRoot = archive.merkleRoot;
        
        const result = await this.mintToken();
        results.push(result);
        
        // Add delay between mints to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        results.push({
          success: false,
          message: `Failed to mint ${archive.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
    
    return results;
  }
}

/**
 * Utility function to validate Ethereum private key
 */
export function validatePrivateKey(privateKey: string): boolean {
  try {
    new ethers.Wallet(privateKey);
    return true;
  } catch {
    return false;
  }
}
