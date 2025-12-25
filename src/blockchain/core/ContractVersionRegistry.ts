/**
 * ContractVersionRegistry - Central registry for contract versions and their capabilities
 * 
 * This registry defines what each contract version supports, enabling the adapter system
 * to handle version-specific differences cleanly.
 */

export type ContractVersion = '2.0' | '2.10' | '2.11';

/**
 * Capabilities that a contract version may support
 */
export interface VersionCapabilities {
  /** Whether this version supports encryptedHash field */
  supportsEncryptedHash: boolean;
  
  /** Whether this version supports fileName field (removed in v2.10+) */
  supportsFileName: boolean;
  
  /** Fields available in getZipFileInfo return value */
  getZipFileInfoFields: string[];
  
  /** Function signature variant for publicMintZipFile */
  publicMintZipFileSignature: 'v2.0' | 'v2.10' | 'v2.11';
  
  /** Whether getVersion() function is available */
  hasGetVersion: boolean;
  
  /** Additional functions available in this version */
  additionalFunctions?: string[];
}

/**
 * Registry mapping contract versions to their capabilities
 */
export const VERSION_REGISTRY: Record<ContractVersion, VersionCapabilities> = {
  '2.0': {
    supportsEncryptedHash: false,
    supportsFileName: true,
    getZipFileInfoFields: ['fileName', 'merkleRootHash', 'ipfsHash', 'creator', 'creationTimestamp', 'tokenizationTime', 'blockNumber'],
    publicMintZipFileSignature: 'v2.0',
    hasGetVersion: true,
    additionalFunctions: []
  },
  '2.10': {
    supportsEncryptedHash: false,
    supportsFileName: false,
    getZipFileInfoFields: ['merkleRootHash', 'ipfsHash', 'creator', 'creationTimestamp', 'tokenizationTime', 'blockNumber'],
    publicMintZipFileSignature: 'v2.10',
    hasGetVersion: true,
    additionalFunctions: []
  },
  '2.11': {
    supportsEncryptedHash: true,
    supportsFileName: false,
    getZipFileInfoFields: ['merkleRootHash', 'encryptedHash', 'ipfsHash', 'creator', 'creationTimestamp', 'tokenizationTime', 'blockNumber'],
    publicMintZipFileSignature: 'v2.11',
    hasGetVersion: true,
    additionalFunctions: ['getEncryptedHash', 'verifyEncryptedZipFile']
  }
};

/**
 * Get capabilities for a specific contract version
 * @param version Contract version string (e.g., "2.11", "2.10")
 * @returns VersionCapabilities if version is supported, null otherwise
 */
export function getVersionCapabilities(version: string): VersionCapabilities | null {
  // Normalize version string (e.g., "2.11.0" -> "2.11")
  const normalizedVersion = normalizeVersion(version);
  
  if (normalizedVersion in VERSION_REGISTRY) {
    return VERSION_REGISTRY[normalizedVersion as ContractVersion];
  }
  
  return null;
}

/**
 * List of versions that have adapter implementations
 * This is separate from the registry to distinguish between "known" and "implemented"
 */
const IMPLEMENTED_VERSIONS: ContractVersion[] = ['2.10', '2.11'];

/**
 * Check if a contract version is supported (has both registry entry and adapter implementation)
 * @param version Contract version string
 * @returns true if version is supported and has an adapter, false otherwise
 */
export function isVersionSupported(version: string): boolean {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return false;
  }
  // Version must be in registry AND have an adapter implementation
  return getVersionCapabilities(normalized) !== null && 
         IMPLEMENTED_VERSIONS.includes(normalized as ContractVersion);
}

/**
 * Normalize version string to major.minor format
 * @param version Version string (e.g., "2.11.0", "2.11", "2.10")
 * @returns Normalized version (e.g., "2.11", "2.10")
 */
export function normalizeVersion(version: string): string {
  // Remove any "unknown" or empty strings
  if (!version || version === 'unknown' || version.trim() === '') {
    return '';
  }
  
  // Extract major.minor from version string (e.g., "2.11.0" -> "2.11")
  const parts = version.split('.');
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  
  // If already in major.minor format, return as-is
  return version;
}

/**
 * Get all supported contract versions
 * @returns Array of supported version strings
 */
export function getSupportedVersions(): ContractVersion[] {
  return Object.keys(VERSION_REGISTRY) as ContractVersion[];
}

