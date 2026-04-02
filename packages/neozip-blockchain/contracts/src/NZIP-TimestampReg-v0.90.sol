// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title NZIPTimestampReg
 * @dev Gas-efficient storage contract for batch merkle roots (inspired by OpenTimestamps)
 * 
 * This contract stores merkle roots submitted by authorized servers. Each batch contains
 * multiple SHA-256 digests organized in a merkle tree. Users can verify their digest
 * is part of a batch using merkle proofs (free view function).
 * 
 * Used by NZIP-NFT-v2.50+ for timestamp proof verification.
 * 
 * Features:
 * - Batch storage with block timestamp and block number
 * - Multi-server support (owner can add/remove authorized submitters)
 * - Free merkle proof verification (view function)
 * - Gas optimized for minimal storage costs
 * 
 * Version: 0.90.0
 */
contract NZIPTimestampReg is Ownable {
    
    // ============================================================================
    // Data Structures
    // ============================================================================
    
    /**
     * @dev Batch information stored for each merkle root
     * Packed for gas efficiency: timestamp and blockNumber fit in same slot
     */
    struct Batch {
        uint128 timestamp;      // block.timestamp when submitted (uint128 is enough until year 10^31)
        uint64 blockNumber;     // block.number when submitted
        uint64 hashCount;       // number of digests in batch
        uint64 batchNumber;     // sequential batch number (1-indexed)
        bool exists;            // flag to check if batch exists
    }
    
    // ============================================================================
    // State Variables
    // ============================================================================
    
    /// @dev Mapping from merkle root to batch information
    mapping(bytes32 => Batch) public batches;
    
    /// @dev Mapping from batch number to merkle root (for enumeration)
    mapping(uint256 => bytes32) public batchNumberToRoot;
    
    /// @dev Mapping of authorized submitters (addresses that can submit batches)
    mapping(address => bool) public authorizedSubmitters;
    
    /// @dev Total number of batches submitted (also the next batch number)
    uint256 public totalBatches;
    
    /// @dev Total number of digests across all batches
    uint256 public totalDigests;
    
    // ============================================================================
    // Events
    // ============================================================================
    
    /// @dev Emitted when a new batch is submitted
    event BatchSubmitted(
        bytes32 indexed merkleRoot,
        uint256 indexed batchNumber,
        address indexed submitter,
        uint256 timestamp,
        uint256 blockNumber,
        uint256 hashCount
    );
    
    /// @dev Emitted when an authorized submitter is added
    event SubmitterAdded(address indexed submitter, address indexed addedBy);
    
    /// @dev Emitted when an authorized submitter is removed
    event SubmitterRemoved(address indexed submitter, address indexed removedBy);
    
    // ============================================================================
    // Modifiers
    // ============================================================================
    
    /// @dev Restricts function to authorized submitters only
    modifier onlyAuthorized() {
        require(authorizedSubmitters[msg.sender], "NZIPTimestampReg: not authorized");
        _;
    }
    
    // ============================================================================
    // Constructor
    // ============================================================================
    
    /**
     * @dev Initializes the contract and adds the deployer as the first authorized submitter
     */
    constructor() Ownable(msg.sender) {
        // Add owner as first authorized submitter
        authorizedSubmitters[msg.sender] = true;
        emit SubmitterAdded(msg.sender, msg.sender);
    }
    
    // ============================================================================
    // Admin Functions
    // ============================================================================
    
    /**
     * @dev Add a new authorized submitter
     * @param submitter Address to authorize for batch submission
     */
    function addAuthorizedSubmitter(address submitter) external onlyOwner {
        require(submitter != address(0), "NZIPTimestampReg: zero address");
        require(!authorizedSubmitters[submitter], "NZIPTimestampReg: already authorized");
        
        authorizedSubmitters[submitter] = true;
        emit SubmitterAdded(submitter, msg.sender);
    }
    
    /**
     * @dev Remove an authorized submitter
     * @param submitter Address to remove from authorized submitters
     */
    function removeAuthorizedSubmitter(address submitter) external onlyOwner {
        require(authorizedSubmitters[submitter], "NZIPTimestampReg: not authorized");
        
        authorizedSubmitters[submitter] = false;
        emit SubmitterRemoved(submitter, msg.sender);
    }
    
    // ============================================================================
    // Core Functions
    // ============================================================================
    
    /**
     * @dev Submit a new batch merkle root
     * @param merkleRoot The merkle root of the batch (keccak256 hash)
     * @param hashCount Number of digests in this batch
     */
    function submitBatch(bytes32 merkleRoot, uint64 hashCount) external onlyAuthorized {
        require(merkleRoot != bytes32(0), "NZIPTimestampReg: empty merkle root");
        require(hashCount > 0, "NZIPTimestampReg: zero hash count");
        require(!batches[merkleRoot].exists, "NZIPTimestampReg: batch already exists");
        
        // Increment batch counter (1-indexed)
        totalBatches++;
        uint64 batchNumber = uint64(totalBatches);
        
        // Store batch information
        batches[merkleRoot] = Batch({
            timestamp: uint128(block.timestamp),
            blockNumber: uint64(block.number),
            hashCount: hashCount,
            batchNumber: batchNumber,
            exists: true
        });
        
        // Map batch number to merkle root for enumeration
        batchNumberToRoot[batchNumber] = merkleRoot;
        
        // Update digest counter
        totalDigests += hashCount;
        
        emit BatchSubmitted(
            merkleRoot,
            batchNumber,
            msg.sender,
            block.timestamp,
            block.number,
            hashCount
        );
    }
    
    // ============================================================================
    // View Functions
    // ============================================================================
    
    /**
     * @dev Verify that a digest is part of a batch using merkle proof
     * @param digest The SHA-256 digest to verify (as bytes32)
     * @param proof The merkle proof path
     * @param merkleRoot The merkle root of the batch
     * @return isValid True if the proof is valid and batch exists
     * @return batchNumber The sequential batch number (0 if invalid)
     * @return timestamp The timestamp when the batch was submitted (0 if invalid)
     * @return blockNumber The block number when batch was submitted (0 if invalid)
     */
    function verifyProof(
        bytes32 digest,
        bytes32[] calldata proof,
        bytes32 merkleRoot
    ) external view returns (bool isValid, uint256 batchNumber, uint256 timestamp, uint256 blockNumber) {
        // Check if batch exists
        Batch memory batch = batches[merkleRoot];
        if (!batch.exists) {
            return (false, 0, 0, 0);
        }
        
        // Verify the merkle proof
        // The leaf is the digest itself (already hashed)
        isValid = MerkleProof.verify(proof, merkleRoot, digest);
        
        if (isValid) {
            return (true, batch.batchNumber, batch.timestamp, batch.blockNumber);
        }
        
        return (false, 0, 0, 0);
    }
    
    /**
     * @dev Get batch information by merkle root
     * @param merkleRoot The merkle root to query
     * @return exists Whether the batch exists
     * @return batchNumber Sequential batch number (1-indexed)
     * @return timestamp When the batch was submitted
     * @return blockNumber Block number when submitted
     * @return hashCount Number of digests in the batch
     */
    function getBatch(bytes32 merkleRoot) external view returns (
        bool exists,
        uint256 batchNumber,
        uint256 timestamp,
        uint256 blockNumber,
        uint256 hashCount
    ) {
        Batch memory batch = batches[merkleRoot];
        return (
            batch.exists,
            batch.batchNumber,
            batch.timestamp,
            batch.blockNumber,
            batch.hashCount
        );
    }
    
    /**
     * @dev Get batch information by batch number
     * @param batchNumber The sequential batch number (1-indexed)
     * @return exists Whether the batch exists
     * @return merkleRoot The merkle root of the batch
     * @return timestamp When the batch was submitted
     * @return blockNumber Block number when submitted
     * @return hashCount Number of digests in the batch
     */
    function getBatchByNumber(uint256 batchNumber) external view returns (
        bool exists,
        bytes32 merkleRoot,
        uint256 timestamp,
        uint256 blockNumber,
        uint256 hashCount
    ) {
        require(batchNumber > 0 && batchNumber <= totalBatches, "NZIPTimestampReg: invalid batch number");
        merkleRoot = batchNumberToRoot[batchNumber];
        require(merkleRoot != bytes32(0), "NZIPTimestampReg: batch not found");
        
        Batch memory batch = batches[merkleRoot];
        return (
            batch.exists,
            merkleRoot,
            batch.timestamp,
            batch.blockNumber,
            batch.hashCount
        );
    }
    
    /**
     * @dev Check if a merkle root has been submitted
     * @param merkleRoot The merkle root to check
     * @return True if the batch exists
     */
    function batchExists(bytes32 merkleRoot) external view returns (bool) {
        return batches[merkleRoot].exists;
    }
    
    /**
     * @dev Check if an address is an authorized submitter
     * @param submitter Address to check
     * @return True if authorized
     */
    function isAuthorizedSubmitter(address submitter) external view returns (bool) {
        return authorizedSubmitters[submitter];
    }
    
    /**
     * @dev Get contract version
     * @return version The version string
     */
    function getVersion() external pure returns (string memory) {
        return "0.90.0";
    }
    
    /**
     * @dev Get contract statistics
     * @return _totalBatches Total number of batches submitted
     * @return _totalDigests Total number of digests across all batches
     */
    function getStats() external view returns (uint256 _totalBatches, uint256 _totalDigests) {
        return (totalBatches, totalDigests);
    }
}
