/**
 * Node Blockchain Module Exports
 * Node.js-specific blockchain functionality for ZIP file tokenization
 * 
 * Note: ZipkitMinter and ZipkitVerifier convenience methods (retry, batch) 
 * are now available in the core module. Only WalletManagerNode is Node.js-specific
 * due to file system operations.
 */

export { WalletManagerNode, ZipkitWallet } from './WalletManagerNode';

// Re-export specific core functionality to avoid duplicates
export { 
  ZipkitMinter,
  ZipkitVerifier,
  CoreWalletManager,
  WalletAnalyzer,
  createTimestamp,
  verifyOts,
  verifyOtsZip
} from '../core';
export type {
  MintingOptions,
  MintingResult,
  VerificationOptions,
  VerificationResult,
  WalletInfo,
  NetworkConfig,
  TokenMetadata,
  WalletSetupResult,
  CommonTokenConfig,
  TokenInfo,
  WalletBasicInfo,
  TokenScanResult,
  NZipTokenDetails,
  TimestampResult,
  TimestampInfo,
  DeserializeOtsResult,
  OtsVerifyResult
} from '../core';
