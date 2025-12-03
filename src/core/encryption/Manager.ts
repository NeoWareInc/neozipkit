/**
 * Encryption Manager for NeoZipKit
 * Manages different encryption providers and provides a unified interface
 */

import { EncryptionProvider, EncryptionOptions, EncryptionResult, DecryptionResult, EncryptionMethod } from './types';
import { ZipCrypto } from './ZipCrypto';

export class EncryptionManager {
  private providers: Map<EncryptionMethod, EncryptionProvider> = new Map();

  constructor() {
    // Register default encryption providers
    this.registerProvider(new ZipCrypto());
  }

  /**
   * Register a new encryption provider
   */
  registerProvider(provider: EncryptionProvider): void {
    if (provider.canHandle(EncryptionMethod.ZIP_CRYPTO)) {
      this.providers.set(EncryptionMethod.ZIP_CRYPTO, provider);
    }
  }

  /**
   * Get available encryption methods
   */
  getAvailableMethods(): EncryptionMethod[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get encryption provider for a specific method
   */
  getProvider(method: EncryptionMethod): EncryptionProvider | null {
    return this.providers.get(method) || null;
  }

  /**
   * Encrypt data using specified method
   */
  async encrypt(data: Buffer, options: EncryptionOptions): Promise<EncryptionResult> {
    const provider = this.getProvider(options.method);
    if (!provider) {
      return {
        success: false,
        error: `No encryption provider available for method ${options.method}`
      };
    }

    return await provider.encrypt(data, options);
  }

  /**
   * Decrypt data using specified method
   */
  async decrypt(data: Buffer, options: EncryptionOptions): Promise<DecryptionResult> {
    const provider = this.getProvider(options.method);
    if (!provider) {
      return {
        success: false,
        error: `No decryption provider available for method ${options.method}`
      };
    }

    return await provider.decrypt(data, options);
  }

  /**
   * Get recommended encryption method (ZIP_CRYPTO)
   */
  getRecommendedMethod(): EncryptionMethod {
    return EncryptionMethod.ZIP_CRYPTO;
  }

  /**
   * Validate encryption options
   */
  validateOptions(options: EncryptionOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!options.method) {
      errors.push('Encryption method is required');
    }

    if (!options.password || options.password.length === 0) {
      errors.push('Password is required');
    }

    if (options.password && options.password.length < 4) {
      errors.push('Password must be at least 4 characters long');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Get encryption method info
   */
  getMethodInfo(method: EncryptionMethod): { name: string; keyLength: number; secure: boolean } | null {
    const provider = this.getProvider(method);
    if (!provider) {
      return null;
    }

    return {
      name: provider.getMethodName(),
      keyLength: provider.getKeyLength(),
      secure: false
    };
  }

  /**
   * List all available encryption methods with their details
   */
  listMethods(): Array<{ method: EncryptionMethod; name: string; keyLength: number; secure: boolean }> {
    const methods: Array<{ method: EncryptionMethod; name: string; keyLength: number; secure: boolean }> = [];
    
    for (const [method, provider] of this.providers) {
      methods.push({
        method: method,
        name: provider.getMethodName(),
        keyLength: provider.getKeyLength(),
        secure: false
      });
    }

    return methods.sort((a, b) => {
      // Sort by name
      return a.name.localeCompare(b.name);
    });
  }
}
