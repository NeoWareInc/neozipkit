/**
 * V2_10Adapter - Adapter for contract version 2.10
 * 
 * Handles v2.10 contract operations:
 * - No encryptedHash support
 * - No fileName field
 * - publicMintZipFile signature: (merkleRootHash, creationTimestamp, ipfsHash, metadataURI)
 */

import type { Contract, ContractTransactionResponse, BaseContract } from 'ethers';
import { Interface, Contract as EthersContract } from 'ethers';
import type { ContractVersionAdapter, ZipFileInfo, ZipFileTokenizedEvent } from './ContractVersionAdapter';

// Minimal ABI for v2.10 operations
const V2_10_ABI = [
  "function publicMintZipFile(string memory merkleRootHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public returns (uint256)",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)"
];

const iface = new Interface(V2_10_ABI);

export class V2_10Adapter implements ContractVersionAdapter {
  readonly version = '2.10';

  async mintZipFile(
    contract: Contract | BaseContract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string,
    gasOptions?: { gasLimit: bigint; gasPrice: bigint }
  ): Promise<ContractTransactionResponse> {
    // v2.10 doesn't support encryptedHash - ignore it
    if (encryptedHash) {
      console.warn('[V2_10Adapter] encryptedHash provided but v2.10 contract does not support it - ignoring');
    }
    
    // v2.10 signature: publicMintZipFile(merkleRootHash, creationTimestamp, ipfsHash, metadataURI)
    const contractTyped = contract as Contract;
    const args = [
      merkleRoot,
      creationTimestamp,
      ipfsHash,
      metadataURI
    ];
    
    if (gasOptions) {
      return await contractTyped.publicMintZipFile(...args, gasOptions) as ContractTransactionResponse;
    }
    
    return await contractTyped.publicMintZipFile(...args) as ContractTransactionResponse;
  }

  async getZipFileInfo(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<ZipFileInfo> {
    // v2.10 returns: (merkleRootHash, ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber)
    // Use adapter's ABI to ensure we get the correct return structure
    const contractTyped = contract as Contract;
    
    // Get the provider/runner from the contract
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    // Create a contract with the adapter's ABI to get the full return structure
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_10_ABI,
      runner
    );
    
    const result = await adapterContract.getZipFileInfo(tokenId);
    
    return {
      merkleRootHash: result[0],
      ipfsHash: result[1],
      creator: result[2],
      creationTimestamp: result[3],
      tokenizationTime: result[4],
      blockNumber: result[5],
      // encryptedHash and fileName not available in v2.10
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
      creationTimestamp: parsed.args.creationTimestamp,
      ipfsHash: parsed.args.ipfsHash,
      tokenizationTime: parsed.args.tokenizationTime,
      blockNumber: parsed.args.blockNumber,
      // encryptedHash and fileName not in v2.10 event
    };
  }

  async estimateGasForMint(
    contract: Contract | BaseContract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string
  ): Promise<bigint> {
    // v2.10 signature: publicMintZipFile(merkleRootHash, creationTimestamp, ipfsHash, metadataURI)
    const contractTyped = contract as Contract;
    return await contractTyped.publicMintZipFile.estimateGas(
      merkleRoot,
      creationTimestamp,
      ipfsHash,
      metadataURI
    );
  }
}

