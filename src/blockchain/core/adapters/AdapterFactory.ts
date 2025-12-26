/**
 * AdapterFactory - Factory for creating contract version adapters
 * 
 * Provides a centralized way to get the correct adapter based on contract version.
 */

import { normalizeVersion, isVersionSupported } from '../ContractVersionRegistry';
import { V2_10Adapter } from './V2_10Adapter';
import { V2_11Adapter } from './V2_11Adapter';
import type { ContractVersionAdapter } from './ContractVersionAdapter';

/**
 * Get the appropriate adapter for a contract version
 * @param version Contract version string (e.g., "2.11", "2.10", "2.11.0")
 * @returns ContractVersionAdapter instance
 * @throws Error if version is not supported
 */
export function getAdapter(version: string): ContractVersionAdapter {
  const normalized = normalizeVersion(version);
  
  if (!normalized) {
    throw new Error(`Invalid contract version: "${version}" (normalized to empty string)`);
  }
  
  if (!isVersionSupported(normalized)) {
    throw new Error(`Unsupported contract version: "${version}" (normalized: "${normalized}"). Supported versions: 2.10, 2.11`);
  }
  
  switch (normalized) {
    case '2.10':
      return new V2_10Adapter();
    case '2.11':
      return new V2_11Adapter();
    default:
      // This should never happen if isVersionSupported is correct, but keep as safety check
      throw new Error(`Unsupported contract version: "${version}" (normalized: "${normalized}"). Supported versions: 2.10, 2.11`);
  }
}

/**
 * Get adapter by chainId (looks up version from CONTRACT_CONFIGS)
 * @param chainId Chain ID
 * @param version Optional version override (if not provided, looks up from config)
 * @returns ContractVersionAdapter instance
 * @throws Error if chainId not found or version not supported
 */
export function getAdapterByChainId(chainId: number, version?: string): ContractVersionAdapter {
  if (version) {
    return getAdapter(version);
  }
  
  // Import here to avoid circular dependency
  const { getContractConfig } = require('../contracts');
  const config = getContractConfig(chainId);
  
  if (!config) {
    throw new Error(`No contract config found for chainId: ${chainId}`);
  }
  
  if (!config.version) {
    throw new Error(`Contract version not specified for chainId: ${chainId}`);
  }
  
  return getAdapter(config.version);
}

