/**
 * neozip-blockchain
 * Blockchain functionality for NeoZip - NFT minting, verification, wallet management, and OpenTimestamps
 * 
 * This package provides standalone blockchain operations that work with neozipkit or independently.
 */

// Export core blockchain functionality (platform-agnostic)
export * from './core';

// Export browser-specific blockchain functionality
export * from './browser';

// Export Node.js-specific blockchain functionality (only WalletManagerNode is Node-specific)
export { 
  WalletManagerNode, 
  ZipkitWallet 
} from './node';

// Export enhanced verification types from core
export type { 
  EnhancedVerificationResult, 
  BatchVerificationResult, 
  VerificationJob 
} from './core/ZipkitVerifier';

// Export Logger utility for console control
export { Logger, configureLoggerFromEnvironment } from './utils/Logger';
export type { LogLevel, LoggerConfig } from './utils/Logger';

// Export Zipstamp server API functionality
export * from './zipstamp-server';

// Export package version (keep in sync with package.json version)
export const VERSION = '0.6.0';

