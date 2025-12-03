/**
 * NeoZipKit Encryption Extension
 * Provides encryption capabilities for neozip-cli
 * Supports traditional ZIP encryption (PKZIP compatible)
 */

export { ZipCrypto, crc32, crc32update } from './ZipCrypto';
export { EncryptionManager } from './Manager';
export { 
  EncryptionMethod, 
  EncryptionOptions, 
  EncryptionResult, 
  DecryptionResult, 
  EncryptionProvider 
} from './types';
