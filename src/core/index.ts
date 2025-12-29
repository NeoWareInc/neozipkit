/**
 * Core Module Exports
 * Core ZIP functionality (platform-agnostic)
 */

// Core ZIP classes
import Zipkit from './Zipkit';
export * from './Zipkit';
export * from './ZipEntry';
export { ZipCompress } from './ZipCompress';
export type { CompressOptions, CreateZipOptions } from './ZipCompress';
export type { DecompressionResult, DecompressionOptions } from './ZipDecompress';
export default Zipkit;

// Shared components
export { default as HashCalculator, HashCalculator as HashCalculatorClass } from './components/HashCalculator';
export * from './components/Util';
export * from './components/Support';
export { ProgressTracker } from './components/ProgressTracker';

// Encryption functionality
export { EncryptionManager } from './encryption/Manager';
export { ZipCrypto, crc32, crc32update, sha256 } from './encryption/ZipCrypto';
export type { EncryptionMethod, EncryptionOptions, EncryptionResult, DecryptionResult, EncryptionProvider } from './encryption/types';

// Types and constants
export * from '../types';
export * from './constants/Headers';
export * from './constants/Errors';
export * from './version';

// Logger utility
export { Logger, configureLoggerFromEnvironment } from './components/Logger';
export type { LogLevel, LoggerConfig } from './components/Logger';

