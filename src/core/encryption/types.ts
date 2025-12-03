/**
 * Encryption types and interfaces for NeoZipKit extension
 */

export enum EncryptionMethod {
  NONE = 0,
  ZIP_CRYPTO = 1
}

export interface EncryptionOptions {
  method: EncryptionMethod;
  password: string;
}

export interface EncryptionResult {
  success: boolean;
  encryptedData?: Buffer;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  decryptedData?: Buffer;
  error?: string;
}

export interface EncryptionProvider {
  encrypt(data: Buffer, options: EncryptionOptions): Promise<EncryptionResult>;
  decrypt(data: Buffer, options: EncryptionOptions): Promise<DecryptionResult>;
  canHandle(method: EncryptionMethod): boolean;
  getMethodName(): string;
  getKeyLength(): number;
}
