/**
 * WalletManagerBrowser - Handles browser-specific wallet operations
 * Manages MetaMask, Coinbase Wallet, and other browser providers
 * Extends CoreWalletManager with browser-specific functionality
 */

import { ethers } from 'ethers';
import { CoreWalletManager } from '../core/WalletManager';
import { CONTRACT_CONFIGS, getContractConfig, isNetworkSupported, NZIP_CONTRACT_ABI } from '../core/contracts';
import { Logger } from '../../core/components/Logger';

// Extend Window interface for Ethereum provider
declare global {
  interface Window {
    ethereum?: any
  }
}

export interface WalletConfigBrowser {
  chainId: number
  network: string
  address: string
  rpcUrls: string[]
  explorerUrl: string
  version: string  // Contract version (e.g., "2.11", "2.10")
}

export class WalletManagerBrowser extends CoreWalletManager {
  private browserProvider: ethers.BrowserProvider | null = null
  private readProvider: ethers.JsonRpcProvider | null = null
  private contract: ethers.Contract | null = null
  private currentConfig: WalletConfigBrowser
  private targetChainId: number | null = null
  
  // Dedicated RPC endpoints for read operations (to avoid rate limiting)
  private RPC_ENDPOINTS: Record<number, string> = {
    1: getContractConfig(1).rpcUrls[0],
    11155111: getContractConfig(11155111).rpcUrls[0], 
    84532: getContractConfig(84532).rpcUrls[0],
    8453: getContractConfig(8453).rpcUrls[0]
  }

  constructor(initialChainId: number = 84532) {
    super();
    this.currentConfig = getContractConfig(initialChainId)
  }

  /**
   * Cleanup method to dispose of providers and stop background processes
   */
  public cleanup(): void {
    Logger.log('🧹 Cleaning up browser wallet manager providers...')
    
    try {
      // Clear providers to stop any ongoing background processes
      if (this.readProvider) {
        try {
          (this.readProvider as any).destroy?.()
        } catch (error) {
          Logger.warn('Could not destroy read provider:', error)
        }
        this.readProvider = null
      }
      
      if (this.browserProvider) {
        this.browserProvider = null
      }
      
      if (this.contract) {
        this.contract = null
      }
      
      Logger.log('✅ Browser wallet manager cleanup completed')
    } catch (error) {
      Logger.warn('Error during browser wallet manager cleanup:', error)
    }
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
   * Set the target network for wallet operations
   */
  public setTargetNetwork(chainId: number): void {
    if (!isNetworkSupported(chainId)) {
      throw new Error(`Network ${chainId} is not supported for tokenization`)
    }
    
    this.targetChainId = chainId
    this.currentConfig = getContractConfig(chainId)
    
    Logger.log(`🎯 Target network set to: ${this.currentConfig.network} (${chainId})`)
    Logger.log(`📍 Contract address: ${this.currentConfig.address}`)
  }

  /**
   * Get the current target network configuration
   */
  public getCurrentConfig(): WalletConfigBrowser {
    return this.currentConfig
  }

  /**
   * Initialize wallet with browser provider
   */
  async initialize(walletAddress: string, existingProvider?: any): Promise<boolean> {
    try {
      // Use existing provider if available, otherwise create new one
      if (existingProvider) {
        Logger.log("🔄 Using existing wallet provider for tokenization")
        
        try {
          this.browserProvider = new ethers.BrowserProvider(existingProvider)
          await this.testProviderConnection(existingProvider)
        } catch (providerError) {
          Logger.warn("❌ Existing provider failed, falling back to window.ethereum:", providerError)
          
          if (window.ethereum) {
            this.browserProvider = new ethers.BrowserProvider(window.ethereum)
            await this.testProviderConnection(window.ethereum)
          } else {
            throw new Error("No wallet provider available")
          }
        }
      } else if (window.ethereum) {
        Logger.log("🔄 Creating new provider from window.ethereum")
        
        try {
          this.browserProvider = new ethers.BrowserProvider(window.ethereum)
          await this.testProviderConnection(window.ethereum)
        } catch (windowEthError: any) {
          throw new Error(`Failed to connect to wallet: ${windowEthError.message}`)
        }
      } else {
        throw new Error("No wallet provider found")
      }

      // Get chain ID with rate limit protection
      let chainId: number | null = null
      
      Logger.log("🔍 Starting network detection...")
      
      try {
        Logger.log("📡 Attempting single eth_chainId call...")
        const hexChainId = await this.browserProvider.send("eth_chainId", [])
        chainId = parseInt(hexChainId, 16)
        Logger.log(`✅ Network detected: Chain ${chainId}`)
      } catch (chainIdError) {
        Logger.warn("❌ Chain ID detection failed:", chainIdError)
        chainId = this.currentConfig.chainId
        Logger.log(`⚠️ Using default chain ID: ${chainId}`)
      }

      Logger.log(`🎯 Final detected chain ID: ${chainId}`)
      Logger.log(`🎯 Required chain ID: ${this.currentConfig.chainId}`)

      // If no explicit target was set, adopt the detected network
      if (!this.targetChainId && chainId) {
        this.currentConfig = getContractConfig(chainId)
        Logger.log(`🎛 Adopted current network: ${this.currentConfig.network} (${chainId})`)
      }

      // Set up dedicated read provider to avoid rate limiting
      if (chainId && this.RPC_ENDPOINTS[chainId]) {
        try {
          Logger.log(`🔗 Testing RPC endpoint before creating provider for chain ${chainId}...`)
          const rpcUrl = this.RPC_ENDPOINTS[chainId]
          
          // Test RPC endpoint with fetch first
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500)
          const testResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
            signal: controller.signal,
          }).catch(() => null as any)
          clearTimeout(timeout)
          
          if (!testResponse || !testResponse.ok) {
            throw new Error('RPC endpoint did not respond in time')
          }
          
          const testData = await testResponse.json().catch(() => null as any)
          const actualChainId = testData && testData.result ? parseInt(testData.result, 16) : undefined
          if (actualChainId !== chainId) {
            throw new Error(`Chain ID mismatch: expected ${chainId}, got ${actualChainId}`)
          }
          
          Logger.log(`✅ RPC endpoint test passed for chain ${chainId}`)
          
          const networkConfig = {
            name: this.getNetworkName(chainId),
            chainId: chainId
          }
          
          this.readProvider = new ethers.JsonRpcProvider(rpcUrl, networkConfig)
          Logger.log(`✅ Read provider initialized successfully for ${rpcUrl}`)
          
        } catch (readProviderError) {
          Logger.warn("❌ Failed to set up read provider:", readProviderError)
          this.readProvider = null
        }
      }

      // Verify chain ID if we were able to detect it
      if (chainId && chainId !== this.currentConfig.chainId) {
        Logger.log(`❌ Wrong network detected. Current: Chain ${chainId}, Required: Chain ${this.currentConfig.chainId}`)
        
        try {
          Logger.log(`🔄 Attempting to switch to ${this.currentConfig.network}...`)
          await this.addAndSwitchNetwork()
          Logger.log(`✅ Successfully switched to ${this.currentConfig.network}`)
          
          // Re-verify the network after switching
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          try {
            const newNetwork = await this.browserProvider.getNetwork()
            const newChainId = Number(newNetwork.chainId)
            Logger.log(`🔍 Post-switch verification: Chain ${newChainId}`)
            if (newChainId !== this.currentConfig.chainId) {
              throw new Error(`Network switch failed. Still on Chain ${newChainId}`)
            }
            chainId = newChainId

            // Recreate read provider for the new network
            try {
              if (this.readProvider) {
                try { (this.readProvider as any).destroy?.() } catch {}
                this.readProvider = null
              }
              const rpcUrl = this.RPC_ENDPOINTS[newChainId]
              if (rpcUrl) {
                const networkConfig = { name: this.getNetworkName(newChainId), chainId: newChainId }
                this.readProvider = new ethers.JsonRpcProvider(rpcUrl, networkConfig)
                Logger.log(`🔁 Read provider switched to ${rpcUrl}`)
              }
            } catch (rpErr) {
              Logger.warn('Could not recreate read provider after switch:', rpErr)
            }
          } catch (verifyError) {
            Logger.warn("Could not verify network after switch:", verifyError)
            chainId = this.currentConfig.chainId
          }
          
        } catch (switchError) {
          Logger.error("Failed to switch network:", switchError)
          
          throw new Error(
            `Please manually switch to ${this.currentConfig.network} in your wallet.\n\n` +
            `Current network: Chain ${chainId}\n` +
            `Required network: ${this.currentConfig.network} (Chain ID: ${this.currentConfig.chainId})\n\n` +
            `In MetaMask:\n` +
            `1. Click the network dropdown at the top\n` +
            `2. Select "Add network" or "Custom networks"\n` +
            `3. Add ${this.currentConfig.network} network details\n` +
            `4. Switch to ${this.currentConfig.network}\n\n` +
            `Network Details:\n` +
            `• Network Name: ${this.currentConfig.network}\n` +
            `• RPC URL: ${this.currentConfig.rpcUrls[0]}\n` +
            `• Chain ID: ${this.currentConfig.chainId}\n` +
            `• Currency Symbol: ETH\n` +
            `• Block Explorer: ${this.currentConfig.explorerUrl}`
          )
        }
      }

      Logger.log(`🔗 Browser wallet manager initialized`)
      Logger.log(`📡 Connected to ${this.currentConfig.network} (Chain ${chainId || 'unknown'})`)
      Logger.log(`📍 Contract Address: ${this.currentConfig.address}`)
      Logger.log(`👛 Wallet Address: ${walletAddress}`)

      // Initialize contract with the actual contract address
      try {
        const signer = await this.browserProvider.getSigner()
        this.contract = new ethers.Contract(this.currentConfig.address, NZIP_CONTRACT_ABI, signer)
        
        // Test the contract connection by checking if it has code
        try {
          const providerForRead = this.readProvider || this.browserProvider
          const code = await providerForRead.getCode(this.currentConfig.address)
          if (code === '0x') {
            Logger.warn(`⚠️ No contract code found at ${this.currentConfig.address}. Contract may not be deployed on this network.`)
          } else {
            Logger.log(`✅ Contract verified at ${this.currentConfig.address}`)
          }
        } catch (codeError) {
          Logger.warn("Could not verify contract code:", codeError)
        }
        
      } catch (signerError) {
        Logger.error("Failed to get signer or initialize contract:", signerError)
        throw new Error("Could not connect to wallet. Please ensure your wallet is unlocked and connected.")
      }

      return true
    } catch (error) {
      Logger.error("Browser wallet manager initialization failed:", error)
      
      if (error instanceof Error) {
        if (error.message.includes("No wallet provider found")) {
          throw new Error("No crypto wallet detected. Please install MetaMask, Coinbase Wallet, or another Web3 wallet.")
        } else if (error.message.includes("Please switch to")) {
          throw error
        } else if (error.message.includes("Could not connect to wallet")) {
          throw error
        } else {
          throw new Error(`Wallet connection failed: ${error.message}`)
        }
      }
      
      throw error
    }
  }

  /**
   * Get the contract instance
   */
  public getContract(): ethers.Contract | null {
    return this.contract
  }

  /**
   * Get the browser provider instance
   */
  public getBrowserProvider(): ethers.BrowserProvider | null {
    return this.browserProvider
  }

  /**
   * Override parent method to return browser provider
   */
  public getWallet(): ethers.Wallet | null {
    // Browser doesn't have direct wallet access, return null
    return null
  }

  /**
   * Get the read provider instance
   */
  public getReadProvider(): ethers.JsonRpcProvider | null {
    return this.readProvider
  }

  /**
   * Override parent method to check browser provider
   */
  public isReady(): boolean {
    return this.browserProvider !== null
  }

  /**
   * Override parent method to check read provider
   */
  public isOnline(): boolean {
    return this.readProvider !== null || this.browserProvider !== null
  }

  private async addAndSwitchNetwork(): Promise<void> {
    if (!window.ethereum) {
      throw new Error("Ethereum provider not found")
    }

    try {
      // First try to switch to the network (in case it already exists)
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [
          {
            chainId: `0x${this.currentConfig.chainId.toString(16)}`,
          },
        ],
      })
      
      Logger.log(`✅ Successfully switched to existing ${this.currentConfig.network}`)
      
    } catch (switchError: any) {
      // If switching failed, the network might not exist, so try to add it
      if (switchError.code === 4902) {
        Logger.log(`➕ Network not found, adding ${this.currentConfig.network}...`)
        
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${this.currentConfig.chainId.toString(16)}`,
                chainName: this.currentConfig.network,
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: this.currentConfig.rpcUrls,
                blockExplorerUrls: [
                  this.currentConfig.explorerUrl,
                ],
              },
            ],
          })
          
          Logger.log(`✅ Successfully added and switched to ${this.currentConfig.network}`)
          
        } catch (addError: any) {
          Logger.error("Failed to add network:", addError)
          
          if (addError.code === 4001) {
            throw new Error("User rejected the network addition request. Please manually add Base Sepolia network to your wallet.")
          } else {
            throw new Error(`Failed to add ${this.currentConfig.network} network: ${addError.message}`)
          }
        }
      } else if (switchError.code === 4001) {
        throw new Error("User rejected the network switch request. Please manually switch to Base Sepolia in your wallet.")
      } else {
        Logger.error("Network switch failed:", switchError)
        throw new Error(`Failed to switch to ${this.currentConfig.network}: ${switchError.message}`)
      }
    }
  }

  private async testProviderConnection(provider: any): Promise<void> {
    try {
      await provider.request({ method: 'eth_chainId' })
      Logger.log("✅ Provider connection successful (eth_chainId)")
    } catch (error: any) {
      Logger.warn("❌ Provider connection failed (eth_chainId):", error)
      throw new Error(`Could not establish connection to wallet: ${error.message}`)
    }
  }

  // ===== Explorer URL Generation Methods =====

  /**
   * Generate block explorer URL for a transaction
   */
  public getExplorerUrl(transactionHash: string): string {
    return `${this.currentConfig.explorerUrl}/tx/${transactionHash}`
  }

  /**
   * Generate block explorer URL for a contract
   */
  public getContractExplorerUrl(): string {
    return `${this.currentConfig.explorerUrl}/address/${this.currentConfig.address}`
  }

  /**
   * Generate block explorer URL for a token
   * Uses the contract address page where users can search for specific token IDs
   */
  public getTokenExplorerUrl(tokenId: string): string {
    return `${this.currentConfig.explorerUrl}/address/${this.currentConfig.address}#readContract`
  }

  /**
   * Generate block explorer URL for a specific token ID
   * Some explorers support direct token URLs
   */
  public getTokenDirectUrl(tokenId: string): string {
    // This varies by explorer, but most support this pattern
    return `${this.currentConfig.explorerUrl}/token/${this.currentConfig.address}?a=${tokenId}`
  }

  /**
   * Generate block explorer URL for an address
   */
  public getAddressExplorerUrl(address: string): string {
    return `${this.currentConfig.explorerUrl}/address/${address}`
  }

  /**
   * Generate block explorer URL for a block
   */
  public getBlockExplorerUrl(blockNumber: string | number): string {
    return `${this.currentConfig.explorerUrl}/block/${blockNumber}`
  }
}
