import type { Wallet, JsonRpcProvider } from 'ethers';

// ============================================================================
// Wallet and Network Types
// ============================================================================

export interface WalletInfo {
  address: string;
  privateKey: string;
  mnemonic: string;
}

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
}

export interface WalletSetupResult {
  wallet: Wallet | null;
  provider: JsonRpcProvider | null;
  success: boolean;
  message?: string;
}

export interface MintingResult {
  success: boolean;
  message: string;
  tokenId?: string;
  txHash?: string;
  creationTimestamp?: number;
}

export interface MintingOptions {
  wallet?: string;
  network: string;
  mintToken: boolean;
}

// ============================================================================
// Token Metadata
// ============================================================================

// Canonical token metadata used across minting, verification, and ZIP embedding
export interface TokenMetadata {
  // Core identifiers
  tokenId: string;
  contractAddress: string;
  network: string;
  merkleRoot: string;
  encryptedHash?: string;  // Hash of encrypted ZIP file (SHA-256 of encrypted bytes) - v2.11+

  // Required chain info (for version management and network identification)
  networkChainId: number;  // Chain ID - required for proper network identification and adapter selection
  contractVersion: string;  // Contract version (e.g., "2.11", "2.10") - required for adapter selection

  // Optional chain info
  transactionHash?: string;
  blockNumber?: number;
  owner?: string;

  // Names and timestamps (support mintedAt/mintDate)
  mintedAt?: string;
  mintDate?: string;
  creationTimestamp?: number;

  // Optional content link
  ipfsHash?: string;

  // Original timestamp information (for tokens created from timestamped ZIPs)
  originalTimestamp?: {
    digest: string;
    tokenId?: string;
    transactionHash?: string;
    timestamp: string;
    network: string;
    networkChainId?: number;
    contractAddress?: string;
    batchId?: string; // For batched timestamps
  };
}

// ============================================================================
// Network Configuration
// ============================================================================

export const NETWORKS: Record<string, NetworkConfig> = {
  'base': {
    name: 'Base Mainnet',
    rpcUrl: 'https://mainnet.base.org',
    chainId: 8453,
    explorerUrl: 'https://basescan.org'
  },
  'base-sepolia': {
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org'
  },
  'base-goerli': {
    name: 'Base Goerli',
    rpcUrl: 'https://goerli.base.org',
    chainId: 84531,
    explorerUrl: 'https://goerli.basescan.org'
  },
  'localhost': {
    name: 'Localhost',
    rpcUrl: 'http://localhost:8545',
    chainId: 31337,
    explorerUrl: 'http://localhost:8545'
  }
};

// ============================================================================
// neozip-blockchain Version Info
// ============================================================================

export interface NeoZipBlockchainInfo {
  version: string;
  releaseDate: string;
}

export const NEOZIP_BLOCKCHAIN_INFO: NeoZipBlockchainInfo = {
  version: '0.7.0',
  releaseDate: '2026-04-06'
};

// ============================================================================
// ZIP Integration Types (Optional - for use with neozipkit)
// ============================================================================

/**
 * Interface for ZIP entry representation
 * Used for compatibility with neozipkit's ZipEntry
 */
export interface ZipEntryLike {
  filename: string;
  sha256?: string | null;
  isDirectory?: boolean;
  isMetaData?: boolean;
}

/**
 * Interface for Zipkit-like operations
 * Used for optional integration with neozipkit
 */
export interface ZipkitLike {
  getMerkleRoot?(): string | null;
  getDirectory?(includeMetadata?: boolean): ZipEntryLike[];
  extract?(entry: ZipEntryLike, raw?: boolean): Promise<Buffer | null>;
  getZipEntry?(filename: string): ZipEntryLike | null;
  extractToBuffer?(entry: ZipEntryLike, options?: any): Promise<Buffer>;
}

