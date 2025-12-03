/**
 * Core WalletManager - Platform-agnostic wallet functionality
 * Provides core wallet operations that work in both browser and server environments
 */

import { ethers } from 'ethers';
import { WalletSetupResult, WalletInfo, NetworkConfig, NETWORKS, MintingOptions } from '../../types';
import { Logger } from '../../core/components/Logger';

export interface CommonTokenConfig { 
  address: string; 
  name: string; 
  symbol: string; 
  type: 'ERC20' | 'ERC721'; 
}

export interface TokenInfo { 
  address: string; 
  name: string; 
  symbol: string; 
  balance: string; 
  decimals?: number; 
  type: 'ERC20' | 'ERC721' | 'NZIP'; 
}

export interface WalletBasicInfo { 
  ethBalance: string; 
  transactionCount: number; 
  networkName: string; 
  chainId: bigint; 
  latestBlock: number; 
}

export interface TokenScanResult { 
  foundTokens: number[]; 
  searchMethod: 'recent-events' | 'iteration' | 'common-ids' | 'none'; 
}

export interface NZipTokenDetails { 
  tokenId: string; 
  merkleRootHash: string; 
  timestamp: number; 
  tokenURI?: string; 
  creator: string; 
  creationTimestamp: number; 
  tokenizationTime: number; 
  ipfsHash?: string; 
}

const NZIP_CONTRACT_ABI = [
  "function getZipFileInfo(uint256 tokenId) view returns (tuple(string merkleRootHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function getTokensByMerkleRoot(string merkleRootHash) view returns (uint256[])",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)"
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

/**
 * Core wallet functionality that works in both browser and server environments
 */
export class CoreWalletManager {
  protected wallet: ethers.Wallet | null = null;
  protected provider: ethers.JsonRpcProvider | null = null;

  constructor() {}

  /**
   * Setup wallet with private key and connect to network
   * 
   * SECURITY WARNING: This method accepts a private key as a parameter.
   * - Never hardcode private keys in source code
   * - Always use environment variables for private keys
   * - Use testnet keys for development/testing
   * - Use secure key management (HSMs, KMS) for production
   * - See SECURITY.md for complete security guidelines
   */
  async setupWallet(privateKey: string, network: string, mintToken: boolean = false): Promise<WalletSetupResult> {
    try {
      const networkConfig = NETWORKS[network] || NETWORKS['base-sepolia'];
      
      this.wallet = new ethers.Wallet(privateKey);
      Logger.log(`Using wallet: ${this.wallet.address}`);
      
      const ok = await this.connectToNetwork(networkConfig, mintToken);
      if (!ok) {
        return { 
          wallet: null, 
          provider: null, 
          success: false, 
          message: `Failed to connect to ${networkConfig.name} network. Blockchain operations require network connectivity.` 
        };
      }
      
      return { 
        wallet: this.wallet, 
        provider: this.provider, 
        success: true, 
        message: `Wallet setup successful for ${networkConfig.name}` 
      };
    } catch (error) {
      Logger.error('Error setting up wallet:', error);
      return { 
        wallet: null, 
        provider: null, 
        success: false, 
        message: `Wallet setup failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Connect to the specified network
   */
  protected async connectToNetwork(networkConfig: NetworkConfig, mintToken: boolean): Promise<boolean> {
    try {
      Logger.log(`Attempting to connect to ${networkConfig.name} network...`);
      this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      
      let networkTimedOut = false;
      const networkTimeout = setTimeout(() => { 
        networkTimedOut = true; 
        Logger.error("Network connection timeout"); 
      }, 5000);
      
      await Promise.race([
        this.provider.getNetwork(),
        new Promise((_, reject) => 
          setTimeout(() => { 
            if (networkTimedOut) reject(new Error("Network connection timeout")); 
          }, 5100)
        )
      ]);
      
      clearTimeout(networkTimeout);
      
      if (this.wallet) {
        this.wallet = this.wallet.connect(this.provider);
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceEth = ethers.formatEther(balance);
        Logger.log(`Wallet balance: ${balanceEth} ETH`);
        
        const minBalance = 0.0001;
        if (parseFloat(balanceEth) < minBalance && mintToken) {
          Logger.error(`ERROR: Insufficient balance (${balanceEth} ETH). Minimum required: ${minBalance} ETH`);
          Logger.error('Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');
          throw new Error(`Insufficient balance for minting. Current: ${balanceEth} ETH, Required: ${minBalance} ETH`);
        } else if (mintToken) {
          Logger.log(`✅ Sufficient balance for token minting`);
        }
      }
      
      Logger.log(`✅ Successfully connected to ${networkConfig.name}`);
      return true;
    } catch (networkError: unknown) {
      const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
      Logger.error(`Failed to connect to ${networkConfig.name} network: ${errorMessage}`);
      this.provider = null;
      return false;
    }
  }

  /**
   * Get the current wallet instance
   */
  getWallet(): ethers.Wallet | null { 
    return this.wallet; 
  }

  /**
   * Get the current provider instance
   */
  getProvider(): ethers.JsonRpcProvider | null { 
    return this.provider; 
  }

  /**
   * Check if wallet is ready
   */
  isReady(): boolean { 
    return this.wallet !== null; 
  }

  /**
   * Check if connected to network
   */
  isOnline(): boolean { 
    return this.provider !== null; 
  }
}

/**
 * Wallet analyzer for blockchain operations
 */
export class WalletAnalyzer {
  private provider: ethers.JsonRpcProvider;
  
  constructor(provider: ethers.JsonRpcProvider) { 
    this.provider = provider; 
  }

  /**
   * Get basic wallet information
   */
  async getWalletBasics(address: string): Promise<WalletBasicInfo> {
    const balance = await this.provider.getBalance(address);
    const ethBalance = ethers.formatEther(balance);
    const txCount = await this.provider.getTransactionCount(address);
    const network = await this.provider.getNetwork();
    const latestBlock = await this.provider.getBlockNumber();
    
    return { 
      ethBalance, 
      transactionCount: txCount, 
      networkName: network.name, 
      chainId: network.chainId, 
      latestBlock 
    };
  }

  /**
   * Scan for NZIP tokens owned by an address
   */
  async scanForNZipTokens(contractAddress: string, ownerAddress: string): Promise<TokenScanResult> {
    const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, this.provider);
    let foundTokens: number[] = [];
    let searchMethod: TokenScanResult['searchMethod'] = 'none';
    
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const startBlock = Math.max(0, latestBlock - 50000);
      const filter = contract.filters.ZipFileTokenized(null, ownerAddress);
      const events = await contract.queryFilter(filter, startBlock, 'latest');
      
      for (const event of events) {
        if ('args' in event && event.args && (event as any).args.tokenId) {
          const tokenId = Number((event as any).args.tokenId);
          if (!foundTokens.includes(tokenId)) foundTokens.push(tokenId);
        }
      }
      
      if (foundTokens.length > 0) { 
        return { foundTokens, searchMethod: 'recent-events' }; 
      }
    } catch {}
    
    try {
      const totalSupply = await contract.totalSupply();
      const maxCheck = Math.min(Number(totalSupply), 50);
      
      for (let tokenId = 0; tokenId < maxCheck; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId);
          if (owner.toLowerCase() === ownerAddress.toLowerCase()) foundTokens.push(tokenId);
        } catch {}
      }
      
      if (foundTokens.length > 0) return { foundTokens, searchMethod: 'iteration' };
    } catch {}
    
    const commonTokenIds = Array.from({length: 20}, (_, i) => i);
    for (const tokenId of commonTokenIds) {
      try {
        const owner = await contract.ownerOf(tokenId);
        if (owner.toLowerCase() === ownerAddress.toLowerCase()) foundTokens.push(tokenId);
      } catch {}
    }
    
    return { foundTokens, searchMethod: foundTokens.length > 0 ? 'common-ids' : 'none' };
  }

  /**
   * Get detailed information for NZIP tokens
   */
  async getNZipTokenDetails(contractAddress: string, tokenIds: number[]): Promise<NZipTokenDetails[]> {
    const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, this.provider);
    const tokenDetails: NZipTokenDetails[] = [];
    
    for (const tokenId of tokenIds) {
      try {
        const zipInfo = await contract.getZipFileInfo(tokenId);
        tokenDetails.push({
          tokenId: tokenId.toString(),
          merkleRootHash: zipInfo.merkleRootHash,
          timestamp: Number(zipInfo.creationTimestamp),
          creator: zipInfo.creator,
          creationTimestamp: Number(zipInfo.creationTimestamp),
          tokenizationTime: Number(zipInfo.tokenizationTime),
          ipfsHash: zipInfo.ipfsHash || undefined
        });
      } catch (error) {
        Logger.error(`Error fetching details for token ${tokenId}:`, error);
      }
    }
    
    return tokenDetails;
  }

  /**
   * Get contract information
   */
  async getContractInfo(contractAddress: string): Promise<{name: string, symbol: string, totalSupply: string} | null> {
    try {
      const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, this.provider);
      const [name, symbol, totalSupply] = await Promise.all([
        contract.name(), 
        contract.symbol(), 
        contract.totalSupply()
      ]);
      return { name, symbol, totalSupply: totalSupply.toString() };
    } catch { 
      return null; 
    }
  }

  /**
   * Check for ERC20 tokens
   */
  async checkERC20Tokens(ownerAddress: string, tokenConfigs: CommonTokenConfig[]): Promise<TokenInfo[]> {
    const foundTokens: TokenInfo[] = [];
    
    for (const tokenConfig of tokenConfigs.filter(t => t.type === 'ERC20')) {
      try {
        const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, this.provider);
        const balance = await contract.balanceOf(ownerAddress);
        
        if (balance > 0) {
          let name = tokenConfig.name, symbol = tokenConfig.symbol, decimals = 18;
          try { 
            [name, symbol, decimals] = await Promise.all([
              contract.name(), 
              contract.symbol(), 
              contract.decimals()
            ]); 
          } catch {}
          
          const formattedBalance = ethers.formatUnits(balance, decimals);
          foundTokens.push({ 
            address: tokenConfig.address, 
            name, 
            symbol, 
            balance: formattedBalance, 
            decimals, 
            type: 'ERC20' 
          });
        }
      } catch {}
    }
    
    return foundTokens;
  }

  /**
   * Check for NFT collections
   */
  async checkNFTCollections(ownerAddress: string, nftConfigs: CommonTokenConfig[]): Promise<TokenInfo[]> {
    const foundNFTs: TokenInfo[] = [];
    
    for (const nftConfig of nftConfigs) {
      try {
        const contract = new ethers.Contract(nftConfig.address, ERC721_ABI, this.provider);
        const balance = await contract.balanceOf(ownerAddress);
        
        if (balance > 0) {
          let name = nftConfig.name, symbol = nftConfig.symbol;
          try { 
            [name, symbol] = await Promise.all([
              contract.name(), 
              contract.symbol()
            ]); 
          } catch {}
          
          foundNFTs.push({ 
            address: nftConfig.address, 
            name, 
            symbol, 
            balance: balance.toString(), 
            type: 'ERC721' 
          });
        }
      } catch {}
    }
    
    return foundNFTs;
  }

  /**
   * Get common token configurations for a network
   */
  static getCommonTokens(network: string): CommonTokenConfig[] {
    const commonTokens: Record<string, CommonTokenConfig[]> = {
      'base-sepolia': [
        { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'USD Coin', symbol: 'USDC', type: 'ERC20' },
        { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', type: 'ERC20' },
        { address: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', type: 'ERC20' },
      ],
      'base': [
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', type: 'ERC20' },
        { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', type: 'ERC20' },
        { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Dai Stablecoin', symbol: 'DAI', type: 'ERC20' },
        { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', type: 'ERC20' },
        { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', name: 'USD Base Coin', symbol: 'USDbC', type: 'ERC20' },
      ]
    };
    return commonTokens[network] || [];
  }

  /**
   * Get common NFT configurations for a network
   */
  static getCommonNFTs(network: string): CommonTokenConfig[] {
    const commonNFTs: Record<string, CommonTokenConfig[]> = {
      'base-sepolia': [ ],
      'base': [
        { address: '0x1234567890123456789012345678901234567890', name: 'Base Punks', symbol: 'BPUNK', type: 'ERC721' },
        { address: '0x0987654321098765432109876543210987654321', name: 'Base Bears', symbol: 'BBEAR', type: 'ERC721' },
      ]
    };
    return commonNFTs[network] || [];
  }
}
