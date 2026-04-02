/**
 * V2_50Adapter - Adapter for contract version 2.50
 * 
 * Handles v2.50 contract operations:
 * - Full v2.11 compatibility (encryptedHash, publicMintZipFile)
 * - Timestamp proof minting via mintWithTimestampProof()
 * - NZIPTimestampReg integration
 * - Mint fee support
 * - Authorized minters
 */

import type { Contract, ContractTransactionResponse, BaseContract } from 'ethers';
import { Interface, Contract as EthersContract } from 'ethers';
import type { ContractVersionAdapter, ZipFileInfo, ZipFileTokenizedEvent, TimestampProofData } from './ContractVersionAdapter';

// Full ABI for v2.50 operations
const V2_50_ABI = [
  // v2.11 compatible functions
  "function publicMintZipFile(string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function publicMintZipFile(string memory merkleRootHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function getEncryptedHash(uint256 tokenId) external view returns (string memory)",
  "function isZipFileTokenized(string memory merkleRootHash, uint256 creationTimestamp) external view returns (bool exists, uint256 tokenId)",
  "function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid)",
  "function verifyEncryptedZipFile(uint256 tokenId, string memory providedEncryptedHash) external view returns (bool isValid)",
  "function getBlockchainMetadata(uint256 tokenId) public view returns (uint256 blockNumber, uint256 tokenizationTime)",
  "function generateCompositeKey(string memory merkleRootHash, uint256 creationTimestamp) public pure returns (bytes32)",
  "function totalSupply() public view returns (uint256)",
  "function getVersion() external pure returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  
  // v2.50 timestamp proof functions
  "function mintWithTimestampProof(string memory merkleRootHash, bytes32[] calldata proof, bytes32 batchMerkleRoot) external payable returns (uint256)",
  "function hasTimestampProof(uint256 tokenId) external view returns (bool)",
  "function getTimestampProof(uint256 tokenId) external view returns (tuple(bool hasTimestampProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber) data, bytes32[] memory merkleProof)",
  "function getTokenData(uint256 tokenId) external view returns (bytes32 merkleRoot, uint256 mintedAt, uint256 mintBlockNumber, address originalOwner, bool hasProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber)",
  "function verifyToken(uint256 tokenId) external view returns (bool isValid)",
  "function getRegistry() external view returns (address)",
  
  // v2.50 admin functions
  "function mintFee() public view returns (uint256)",
  "function mintFeeRequired() public view returns (bool)",
  "function setMintFee(uint256 newFee) external",
  "function setMintFeeRequired(bool required) external",
  "function withdrawFees(address payable to) external",
  "function authorizeMinter(address minter) external",
  "function deauthorizeMinter(address minter) external",
  "function isAuthorizedMinter(address minter) external view returns (bool)",
  "function authorizedMinters(address) public view returns (bool)",
  
  // Events
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)",
  "event TimestampProofMinted(uint256 indexed tokenId, address indexed creator, bytes32 indexed batchMerkleRoot, string merkleRootHash, uint256 batchTimestamp, uint256 tokenizationTime, uint256 blockNumber)",
  "event FeeUpdated(uint256 oldFee, uint256 newFee)",
  "event MinterAuthorized(address indexed minter, address indexed authorizedBy)",
  "event MinterDeauthorized(address indexed minter, address indexed deauthorizedBy)"
];

const iface = new Interface(V2_50_ABI);

export class V2_50Adapter implements ContractVersionAdapter {
  readonly version = '2.50';

  async mintZipFile(
    contract: Contract | BaseContract,
    merkleRoot: string,
    encryptedHash: string | undefined,
    creationTimestamp: number,
    ipfsHash: string,
    metadataURI: string,
    gasOptions?: { gasLimit: bigint; gasPrice: bigint }
  ): Promise<ContractTransactionResponse> {
    // v2.50 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
    // Use empty string if encryptedHash is not provided
    const contractTyped = contract as Contract;
    const args = [
      merkleRoot,
      encryptedHash || '',
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
    // v2.50 returns: (merkleRootHash, encryptedHash, ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber)
    const contractTyped = contract as Contract;
    
    // Get the provider/runner from the contract
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    // Create a contract with the adapter's ABI to get the full return structure
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    const result = await adapterContract.getZipFileInfo(tokenId);
    
    return {
      merkleRootHash: result[0],
      encryptedHash: result[1] || undefined,  // May be empty string
      ipfsHash: result[2],
      creator: result[3],
      creationTimestamp: result[4],
      tokenizationTime: result[5],
      blockNumber: result[6],
      // fileName not available in v2.50
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
      // fileName not in v2.50 event
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
    // v2.50 signature: publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)
    const contractTyped = contract as Contract;
    return await contractTyped.publicMintZipFile.estimateGas(
      merkleRoot,
      encryptedHash || '',
      creationTimestamp,
      ipfsHash,
      metadataURI
    );
  }

  // ============================================================================
  // v2.50 Timestamp Proof Methods
  // ============================================================================

  /**
   * Mint an NFT with timestamp proof (requires NZIPTimestampReg verification)
   * @param contract Contract instance
   * @param merkleRootHash The merkle root hash of the ZIP (as string)
   * @param proof The merkle proof path
   * @param batchMerkleRoot The merkle root of the batch in NZIPTimestampReg
   * @param value Optional ETH value to send (for mint fee)
   * @param gasOptions Optional gas limit and price
   * @returns Transaction response
   */
  async mintWithTimestampProof(
    contract: Contract | BaseContract,
    merkleRootHash: string,
    proof: string[],
    batchMerkleRoot: string,
    value?: bigint,
    gasOptions?: { gasLimit?: bigint; gasPrice?: bigint }
  ): Promise<ContractTransactionResponse> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    const txOptions: any = {};
    if (value) txOptions.value = value;
    if (gasOptions?.gasLimit) txOptions.gasLimit = gasOptions.gasLimit;
    if (gasOptions?.gasPrice) txOptions.gasPrice = gasOptions.gasPrice;
    
    return await adapterContract.mintWithTimestampProof(
      merkleRootHash,
      proof,
      batchMerkleRoot,
      txOptions
    ) as ContractTransactionResponse;
  }

  /**
   * Check if a token has timestamp proof
   * @param contract Contract instance
   * @param tokenId Token ID to check
   * @returns True if token was minted with timestamp proof
   */
  async hasTimestampProof(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<boolean> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.hasTimestampProof(tokenId);
  }

  /**
   * Get timestamp proof data for a token
   * @param contract Contract instance
   * @param tokenId Token ID to query
   * @returns Timestamp proof data and merkle proof
   */
  async getTimestampProof(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<{ data: TimestampProofData; merkleProof: string[] }> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    const result = await adapterContract.getTimestampProof(tokenId);
    
    return {
      data: {
        hasTimestampProof: result[0][0],
        batchMerkleRoot: result[0][1],
        batchTimestamp: result[0][2],
        batchBlockNumber: result[0][3]
      },
      merkleProof: result[1]
    };
  }

  /**
   * Get unified token data (for verification compatibility)
   * @param contract Contract instance
   * @param tokenId Token ID to query
   * @returns Unified token data
   */
  async getTokenData(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<{
    merkleRoot: string;
    mintedAt: bigint;
    mintBlockNumber: bigint;
    originalOwner: string;
    hasProof: boolean;
    batchMerkleRoot: string;
    batchTimestamp: bigint;
    batchBlockNumber: bigint;
  }> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    const result = await adapterContract.getTokenData(tokenId);
    
    return {
      merkleRoot: result[0],
      mintedAt: result[1],
      mintBlockNumber: result[2],
      originalOwner: result[3],
      hasProof: result[4],
      batchMerkleRoot: result[5],
      batchTimestamp: result[6],
      batchBlockNumber: result[7]
    };
  }

  /**
   * Verify a token's timestamp proof is still valid
   * @param contract Contract instance
   * @param tokenId Token ID to verify
   * @returns True if valid (or if token has no timestamp proof)
   */
  async verifyToken(
    contract: Contract | BaseContract,
    tokenId: bigint
  ): Promise<boolean> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.verifyToken(tokenId);
  }

  /**
   * Get the NZIPTimestampReg address
   * @param contract Contract instance
   * @returns Registry address
   */
  async getRegistry(
    contract: Contract | BaseContract
  ): Promise<string> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.getRegistry();
  }

  // ============================================================================
  // v2.50 Fee Methods
  // ============================================================================

  /**
   * Get the minting fee
   * @param contract Contract instance
   * @returns Mint fee in wei
   */
  async getMintFee(
    contract: Contract | BaseContract
  ): Promise<bigint> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.mintFee();
  }

  /**
   * Check if minting fee is required
   * @param contract Contract instance
   * @returns True if fee is required
   */
  async isMintFeeRequired(
    contract: Contract | BaseContract
  ): Promise<boolean> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.mintFeeRequired();
  }

  /**
   * Check if an address is an authorized minter
   * @param contract Contract instance
   * @param minter Address to check
   * @returns True if authorized
   */
  async isAuthorizedMinter(
    contract: Contract | BaseContract,
    minter: string
  ): Promise<boolean> {
    const contractTyped = contract as Contract;
    const runner = (contractTyped as any).runner || (contractTyped as any).provider;
    
    const adapterContract = new EthersContract(
      contractTyped.target as string,
      V2_50_ABI,
      runner
    );
    
    return await adapterContract.isAuthorizedMinter(minter);
  }
}
