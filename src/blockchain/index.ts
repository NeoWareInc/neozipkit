/**
 * Blockchain Module Exports
 * Unified blockchain functionality for ZIP file tokenization
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

// Export enhanced verification types from core (now available in core)
export type { 
  EnhancedVerificationResult, 
  BatchVerificationResult, 
  VerificationJob 
} from './core/ZipkitVerifier';

// Export Logger utility for console control (from core module)
export { Logger, configureLoggerFromEnvironment } from '../core';
export type { LogLevel, LoggerConfig } from '../core';