/**
 * ContractVersionAdapter - Interface for version-specific contract operations
 * 
 * Each contract version implements this interface to handle version-specific
 * differences in function signatures, return types, and available fields.
 */

import type { Contract, ContractTransactionResponse, BaseContract } from 'ethers';

/**
 * ZipFileInfo structure returned by adapters
 * Includes all possible fields, with optional fields based on version
 */
export interface ZipFileInfo {
  merkleRootHash: string;
  encryptedHash?: string;  // v2.11+
  ipfsHash: string;
  creator: string;
  creationTimestamp: bigint;
  tokenizationTime: bigint;
  blockNumber: bigint;
  fileName?: string;  // v2.0 only (removed in v2.10+)
}

/**
 * Parsed ZipFileTokenized event
 */
export interface ZipFileTokenizedEvent {
  tokenId: bigint;
  creator: string;
  merkleRootHash: string;
  encryptedHash?: string;  // v2.11+
  creationTimestamp: bigint;
  ipfsHash: string;
  tokenizationTime: bigint;
  blockNumber: bigint;
  fileName?: string;  // v2.0 only
}

/**
 * Interface for contract version adapters
 * Each adapter handles version-specific contract interactions
 */
export interface ContractVersionAdapter {
  /** Contract version this adapter handles (e.g., "2.11", "2.10") */
  readonly version: string;
  
  /**
   * Mint a new ZIP file token
   * @param contract Contract instance (Contract or BaseContract for browser compatibility)
   * @param merkleRoot Merkle root hash of ZIP contents
   * @param encryptedHash Encrypted hash (if supported, undefined otherwise)
   * @param creationTimestamp Creation timestamp
   * @param ipfsHash IPFS hash
   * @param metadataURI Metadata URI
   * @param gasOptions Optional gas limit and price
   * @returns Transaction response
   */
  mintZipFile(
    contract: Contract | BaseContract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string,
    gasOptions?: { gasLimit: bigint; gasPrice: bigint }
  ): Promise<ContractTransactionResponse>;
  
  /**
   * Get ZIP file information for a token
   * @param contract Contract instance (Contract or BaseContract for browser compatibility)
   * @param tokenId Token ID
   * @returns ZipFileInfo with all available fields for this version
   */
  getZipFileInfo(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<ZipFileInfo>;
  
  /**
   * Parse ZipFileTokenized event from log
   * @param log Event log
   * @returns Parsed event data
   */
  parseZipFileTokenizedEvent(log: { topics: string[]; data: string }): ZipFileTokenizedEvent;
  
  /**
   * Estimate gas for mintZipFile operation
   * @param contract Contract instance (Contract or BaseContract for browser compatibility)
   * @param merkleRoot Merkle root hash
   * @param encryptedHash Encrypted hash (if supported)
   * @param creationTimestamp Creation timestamp
   * @param ipfsHash IPFS hash
   * @param metadataURI Metadata URI
   * @returns Estimated gas limit
   */
  estimateGasForMint(
    contract: Contract | BaseContract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string
  ): Promise<bigint>;
}

