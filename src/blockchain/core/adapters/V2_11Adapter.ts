/**
 * V2_11Adapter - Adapter for contract version 2.11
 * 
 * Handles v2.11 contract operations:
 * - Supports encryptedHash field
 * - No fileName field
 * - publicMintZipFile signature: (merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
 */

import type { Contract, ContractTransactionResponse } from 'ethers';
import { Interface } from 'ethers';
import type { ContractVersionAdapter, ZipFileInfo, ZipFileTokenizedEvent } from './ContractVersionAdapter';

// Minimal ABI for v2.11 operations
const V2_11_ABI = [
  "function publicMintZipFile(string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public returns (uint256)",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)"
];

const iface = new Interface(V2_11_ABI);

export class V2_11Adapter implements ContractVersionAdapter {
  readonly version = '2.11';

  async mintZipFile(
    contract: Contract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string,
    gasOptions?: { gasLimit: bigint; gasPrice: bigint }
  ): Promise<ContractTransactionResponse> {
    // v2.11 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
    // Use empty string if encryptedHash is not provided
    const args = [
      merkleRoot,
      encryptedHash || '',
      creationTimestamp,
      ipfsHash,
      metadataURI
    ];
    
    if (gasOptions) {
      return await contract.publicMintZipFile(...args, gasOptions) as ContractTransactionResponse;
    }
    
    return await contract.publicMintZipFile(...args) as ContractTransactionResponse;
  }

  async getZipFileInfo(
    contract: Contract,
    tokenId: bigint
  ): Promise<ZipFileInfo> {
    // v2.11 returns: (merkleRootHash, encryptedHash, ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber)
    const result = await contract.getZipFileInfo(tokenId);
    
    return {
      merkleRootHash: result[0],
      encryptedHash: result[1] || undefined,  // May be empty string
      ipfsHash: result[2],
      creator: result[3],
      creationTimestamp: result[4],
      tokenizationTime: result[5],
      blockNumber: result[6],
      // fileName not available in v2.11
    };
  }

  parseZipFileTokenizedEvent(log: { topics: string[]; data: string }): ZipFileTokenizedEvent {
    const parsed = iface.parseLog({
      topics: log.topics,
      data: log.data
    });
    
    if (!parsed || parsed.name !== 'ZipFileTokenized') {
      throw new Error('Invalid ZipFileTokenized event');
    }
    
    return {
      tokenId: parsed.args.tokenId,
      creator: parsed.args.creator,
      merkleRootHash: parsed.args.merkleRootHash,
      encryptedHash: parsed.args.encryptedHash || undefined,  // May be empty string
      creationTimestamp: parsed.args.creationTimestamp,
      ipfsHash: parsed.args.ipfsHash,
      tokenizationTime: parsed.args.tokenizationTime,
      blockNumber: parsed.args.blockNumber,
      // fileName not in v2.11 event
    };
  }

  async estimateGasForMint(
    contract: Contract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string
  ): Promise<bigint> {
    // v2.11 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
    return await contract.publicMintZipFile.estimateGas(
      merkleRoot,
      encryptedHash || '',
      creationTimestamp,
      ipfsHash,
      metadataURI
    );
  }
}

