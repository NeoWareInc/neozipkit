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
  // DISABLED: ZipkitOTS exports (requires neozipkit)
  // createTimestamp,
  // verifyOts,
  // verifyOtsZip
} from '../core';
export type {
  MintingOptions,
  MintingResult,
  VerificationOptions,
  VerificationResult,
  NetworkConfig,
  TokenMetadata,
  WalletSetupResult,
  CommonTokenConfig,
  WalletBasicInfo,
  TokenScanResult,
  NZipTokenDetails,
  // DISABLED: ZipkitOTS types (requires neozipkit)
  // TimestampResult,
  // TimestampInfo,
  // DeserializeOtsResult,
  // OtsVerifyResult
} from '../core';

