/**
 * ZipkitMinterBrowser - Browser-specific NFT minting for ZIP files
 * Extends core minting functionality with browser-specific features
 */

import { WalletManagerBrowser } from './WalletManagerBrowser';
import type { TokenMetadata } from '../../types';
import { getContractAdapterByVersion } from '../core/contracts';
import type { ContractVersionAdapter } from '../core/adapters/ContractVersionAdapter';

export interface TokenizationResult {
  success: boolean
  tokenId?: string
  transactionHash?: string
  error?: string
}

export interface ExistingToken {
  tokenId: string
  owner: string
  creationTimestamp: number
  mintedAt: string
  transactionHash: string
}

export class ZipkitMinterBrowser {
  private walletManager: WalletManagerBrowser
  private merkleRoot: string
  private encryptedHash: string  // Hash of encrypted ZIP file (v3.0+)

  constructor(merkleRoot: string, walletManager: WalletManagerBrowser, encryptedHash?: string) {
    this.merkleRoot = merkleRoot
    this.encryptedHash = encryptedHash || ''
    this.walletManager = walletManager
  }

  /**
   * Initialize the minter with wallet manager
   */
  async initialize(): Promise<void> {
    if (!this.walletManager.getContract() || !this.walletManager.getBrowserProvider()) {
      throw new Error("Wallet manager not initialized")
    }

    // Browser minter uses wallet manager directly, no core minter needed
    console.log('ZipkitMinterBrowser initialized with wallet manager')
  }

  private getNetworkName(chainId: number): string {
    const networkNames: Record<number, string> = {
      1: "homestead",
      11155111: "sepolia", 
      84532: "base-sepolia",
      8453: "base"
    }
    return networkNames[chainId] || `chain-${chainId}`
  }

  /**
   * Check for any existing tokens with the same Merkle Root
   */
  async findTokensByMerkleRoot(): Promise<ExistingToken[]> {
    const contract = this.walletManager.getContract()
    if (!contract) {
      throw new Error("Service not initialized")
    }

    try {
      const tokenIds = await contract.getFunction("getTokensByMerkleRoot")(this.merkleRoot)
      
      if (tokenIds.length === 0) {
        return []
      }

      const existingTokens: ExistingToken[] = []
      
      for (const tokenId of tokenIds) {
        try {
          const owner = await contract.getFunction("ownerOf")(tokenId)
          const zipFileInfo = await contract.getFunction("getZipFileInfo")(tokenId)
          
          existingTokens.push({
            tokenId: tokenId.toString(),
            owner: owner,
            creationTimestamp: Number(zipFileInfo.tokenizationTime) || 0,
            mintedAt: new Date(Number(zipFileInfo.tokenizationTime) * 1000).toISOString(),
            transactionHash: ''
          })
          
        } catch (error) {
          console.warn(`Could not get info for token ${tokenId}:`, error)
        }
      }
      
      return existingTokens

    } catch (error) {
      console.error("Error finding tokens by merkle root:", error)
      return []
    }
  }

  /**
   * Estimate gas cost for minting
   */
  async estimateGasCost(): Promise<string> {
    const contract = this.walletManager.getContract()
    const provider = this.walletManager.getBrowserProvider()
    
    if (!contract || !provider) {
      throw new Error("Service not initialized")
    }

    try {
      console.log(`⛽ Estimating gas for ZIP archive (${this.merkleRoot.slice(0, 10)}...)`)
      
      const signer = await provider.getSigner()
      const contractWithSigner = contract.connect(signer)
      
      // Create a timestamp for the archive (current time)
      const creationTimestamp = Math.floor(Date.now() / 1000)
      
      // Placeholder values for IPFS hash and token URI
      const ipfsHash = "" // Empty for now, could be implemented later
      const tokenURI = "" // Empty for now, could be implemented later
      
      // Get adapter for this contract version
      const config = this.walletManager.getCurrentConfig()
      if (!config.version) {
        throw new Error(`Contract version not specified for network ${config.network}`)
      }
      const adapter = getContractAdapterByVersion(config.version)
      
      // Estimate gas using adapter (handles version-specific signatures)
      const GAS_ESTIMATION_TIMEOUT = 30000 // 30 seconds
      const gasEstimate: bigint = await Promise.race([
        adapter.estimateGasForMint(
          contractWithSigner,
          this.merkleRoot,
          this.encryptedHash || undefined,
          creationTimestamp,
          ipfsHash,
          tokenURI
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Gas estimation timeout')), GAS_ESTIMATION_TIMEOUT)
        )
      ])
      
      // Get current gas price (use read provider if available) with timeout
      const readProvider = this.walletManager.getReadProvider()
      const providerForRead = readProvider || provider
      const gasPrice = await Promise.race([
        providerForRead.getFeeData(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Gas price fetch timeout')), 10000)
        )
      ])
      const gasCost = gasEstimate * (gasPrice.gasPrice || BigInt(0))
      
      // Convert to ETH (18 decimals)
      const costInEth = Number(gasCost) / 1e18
      
      console.log(`⛽ Estimated gas: ${gasEstimate.toString()} units`)
      console.log(`💰 Estimated cost: ${costInEth.toFixed(6)} ETH`)
      
      return costInEth.toFixed(6)
    } catch (error) {
      console.warn('Gas estimation failed:', error)
      
      // Provide fallback estimate based on error type
      if (error instanceof Error) {
        if (error.message.includes("not supported") || error.message.includes("method")) {
          console.warn("RPC method not supported by wallet provider, using fallback estimate")
          return "0.002" // Higher fallback estimate for complex contract calls
        }
      }
      
      return "0.001" // Default fallback estimate
    }
  }

  /**
   * Mint a new token
   */
  async mintToken(): Promise<TokenizationResult> {
    const contract = this.walletManager.getContract()
    const provider = this.walletManager.getBrowserProvider()
    const config = this.walletManager.getCurrentConfig()
    
    if (!contract || !provider || !config.address) {
      throw new Error("Service not initialized")
    }

    try {
      console.log("🎯 Minting NFT token for ZIP archive...")
      console.log(`📝 Minting token for ZIP archive (filename stored in ZIP metadata only for privacy)`)
      console.log(`🔐 Merkle Root: ${this.merkleRoot}`)
      console.log(`📍 Contract: ${config.address}`)

      // Call the actual contract to mint the token
      const signer = await provider.getSigner()
      const contractWithSigner = contract.connect(signer)
      
      // Create a timestamp for the archive (current time)
      const creationTimestamp = Math.floor(Date.now() / 1000)
      
      // Placeholder values for IPFS hash and token URI
      const ipfsHash = "" // Empty for now, could be implemented later
      const tokenURI = "" // Empty for now, could be implemented later
      
      console.log("📡 Submitting transaction to blockchain...")
      console.log(`🕐 Creation timestamp: ${creationTimestamp}`)
      console.log("🔒 Note: Filename is not stored on blockchain for privacy")
      
      // Get adapter for this contract version
      if (!config.version) {
        throw new Error(`Contract version not specified for network ${config.network}`)
      }
      const adapter = getContractAdapterByVersion(config.version)
      
      // Send the transaction using adapter (this will trigger wallet approval)
      // Adapter handles version-specific function signatures
      // Add timeout to prevent hanging if wallet doesn't respond
      const TX_SEND_TIMEOUT = 60000 // 60 seconds for user to approve
      console.log("⏳ Waiting for wallet approval...")
      
      const tx = await Promise.race([
        adapter.mintZipFile(
          contractWithSigner,
          this.merkleRoot,
          this.encryptedHash || undefined,
          creationTimestamp,
          ipfsHash,
          tokenURI
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction send timeout - wallet approval dialog may not have appeared. Please check your wallet.')), TX_SEND_TIMEOUT)
        )
      ])
      
      console.log(`📜 Transaction submitted: ${tx.hash}`)
      console.log("⏳ Waiting for confirmation...")
      
      // Use read provider for waiting to avoid rate limiting with timeout
      let receipt: any = null
      const CONFIRMATION_TIMEOUT = 120000 // 2 minutes timeout
      
      try {
        const readProvider = this.walletManager.getReadProvider()
        if (readProvider) {
          receipt = await Promise.race([
            readProvider.waitForTransaction(tx.hash),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transaction confirmation timeout')), CONFIRMATION_TIMEOUT)
            )
          ])
        } else {
          receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transaction confirmation timeout')), CONFIRMATION_TIMEOUT)
            )
          ])
        }
      } catch (confirmationError: any) {
        // If timeout, still try to get receipt manually
        if (confirmationError?.message?.includes?.('timeout')) {
          try {
            const readProvider = this.walletManager.getReadProvider()
            const providerForRead = readProvider || provider
            receipt = await providerForRead.getTransactionReceipt(tx.hash)
            if (!receipt) {
              throw new Error(`Transaction ${tx.hash} not found after timeout. It may still be pending.`)
            }
          } catch (manualError: any) {
            throw new Error(`Transaction confirmation failed: ${confirmationError?.message || 'Unknown error'}. Manual lookup also failed: ${manualError?.message || 'Unknown error'}`)
          }
        } else {
          throw confirmationError
        }
      }
      
      if (!receipt) {
        throw new Error('Transaction receipt not available')
      }
      
      console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`)
      
      // Extract token ID from the transaction logs
      let tokenId: string | undefined
      
      // Extract token ID from transaction logs
      if (receipt.logs && Array.isArray(receipt.logs)) {
        for (let i = 0; i < receipt.logs.length; i++) {
          const log = receipt.logs[i]
        
          try {
            const parsed = contract.interface.parseLog(log)
            
            if (parsed) {
              if (parsed.name === 'ZipFileTokenized') {
                tokenId = parsed.args.tokenId.toString()
                break
              } else if (parsed.name === 'Transfer') {
                // ERC721 Transfer event: Transfer(from, to, tokenId)
                const from = parsed.args.from
                const transferTokenId = parsed.args.tokenId
                
                // Only use Transfer events that are minting (from zero address)
                if (from === '0x0000000000000000000000000000000000000000') {
                  tokenId = transferTokenId.toString()
                  break
                }
              }
            }
          } catch (parseError) {
            console.warn(`⚠️ Could not parse log ${i}:`, parseError)
            
            // Try manual parsing for standard ERC721 Transfer event
            if (log.topics && log.topics.length >= 4 && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
              try {
                // ERC721 Transfer event signature
                const from = log.topics[1]
                const to = log.topics[2] 
                const transferTokenId = log.topics[3]
                
                console.log(`🔄 Manual Transfer parse: from=${from}, to=${to}, tokenId=${transferTokenId}`)
                
                // Check if this is a mint (from zero address)
                if (from === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                  tokenId = parseInt(transferTokenId, 16).toString()
                  console.log(`🎯 Found minting via manual parse with token ID: ${tokenId}`)
                  break
                }
              } catch (manualParseError) {
                console.warn(`⚠️ Manual parsing also failed:`, manualParseError)
              }
            }
          }
        }
      }
      
      if (!tokenId) {
        console.error("❌ Could not extract token ID from any logs")
        console.error("📋 Full receipt for debugging:", JSON.stringify(receipt, null, 2))
        throw new Error("Could not extract token ID from transaction receipt")
      }

      console.log(`✅ NFT token minted successfully!`)
      console.log(`🎫 Token ID: ${tokenId}`)
      console.log(`📜 Transaction: ${tx.hash}`)

      return {
        success: true,
        tokenId: tokenId,
        transactionHash: tx.hash
      }

    } catch (error: any) {
      console.error("Token minting failed:", error)

      let errorMessage = "Unknown error occurred"

      if (error.code === 'ACTION_REJECTED') {
        errorMessage = "Transaction was rejected by user"
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = "Insufficient funds for transaction"
      } else if (error.reason) {
        errorMessage = error.reason
      } else if (error.message) {
        errorMessage = error.message
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Create token metadata
   */
  createTokenMetadata(
    tokenId: string,
    transactionHash: string
  ): TokenMetadata {
    const now = new Date()
    const config = this.walletManager.getCurrentConfig()

    // Ensure contractVersion is always set (required field)
    if (!config.version) {
      throw new Error(`Contract version not specified for network ${config.network} (chainId: ${config.chainId})`);
    }

    return {
      tokenId,
      contractAddress: config.address,
      network: config.network,
      networkChainId: config.chainId,
      transactionHash,
      merkleRoot: this.merkleRoot,
      encryptedHash: this.encryptedHash || undefined,
      mintedAt: now.toISOString(),
      creationTimestamp: Math.floor(now.getTime() / 1000),
      contractVersion: config.version  // Required - always set from config
    }
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(transactionHash: string): string {
    return this.walletManager.getExplorerUrl(transactionHash)
  }

  /**
   * Get explorer URL for contract
   */
  getContractExplorerUrl(): string {
    return this.walletManager.getContractExplorerUrl()
  }

  /**
   * Get explorer URL for token
   */
  getTokenExplorerUrl(tokenId: string): string {
    return this.walletManager.getTokenExplorerUrl(tokenId)
  }
}
