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

  // Optional chain info
  networkChainId?: number;
  transactionHash?: string;
  blockNumber?: number;
  owner?: string;

  // Names and timestamps (support mintedAt/mintDate)
  mintedAt?: string;
  mintDate?: string;
  creationTimestamp?: number;

  // Optional content link
  ipfsHash?: string;

  // Encrypted ZIP support (v2.11+)
  encryptedHash?: string;  // Hash of encrypted ZIP file (SHA-256 of encrypted bytes)

  // Versioning
  version?: string;
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
// NeoZipKit Version Info
// ============================================================================

export interface NeoZipKitInfo {
  version: string;
  releaseDate: string;
}

export const NEOZIPKIT_INFO: NeoZipKitInfo = {
  version: '0.70.0-alpha',
  releaseDate: '2024-10-04'
};

// ============================================================================
// File Data Interfaces
// ============================================================================

export interface FileData {
  name: string;
  size: number;
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ZipFileEntry {
  filename: string;
  comment?: string | null;
  fileData?: FileData;
  fileBuffer?: Buffer | null;
  isDirectory: boolean;
  isMetaData: boolean;
  isEncrypted: boolean;
  sha256?: string | null;
}

// ============================================================================
// Support Interface
// ============================================================================

export interface Support {
  base64: boolean;
  array: boolean;
  string: boolean;
  isNode: boolean;
  buffer: boolean;
  uint8array: boolean;
  arrayBuffer: boolean;
  blob: boolean;
  streams: boolean;
  fileReader: boolean;
}

// External module types are handled by installed @types packages
