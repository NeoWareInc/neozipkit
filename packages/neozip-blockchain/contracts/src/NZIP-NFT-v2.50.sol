// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./NZIP-TimestampReg-v0.90.sol";

/**
 * @title NZIPNFT (ZipFileNFTPublic compatible)
 * @dev NZIP ERC-721 NFT contract for NeoZip tokenized ZIP files
 * 
 * This contract extends the neozipkit v2.11 interface with optional timestamp proof support.
 * 
 * Two minting modes:
 * 1. Simple tokenization (neozipkit v2.11 compatible) - publicMintZipFile()
 *    - Mints an NFT for a ZIP file's merkle root
 *    - Compatible with neounzip verification
 * 
 * 2. Timestamp proof minting - mintWithTimestampProof()
 *    - Mints an NFT with verified timestamp proof
 *    - Links to TimestampRegistry batch
 *    - Full cryptographic proof chain
 * 
 * Version: 2.50.0 (extends v2.11 with timestamp proof)
 */
contract NZIPNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    
    // ============================================================================
    // Data Structures (neozipkit v2.11 compatible + timestamp proof extension)
    // ============================================================================
    
    /**
     * @dev ZIP file information - neozipkit v2.11 compatible structure
     */
    struct ZipFileInfo {
        string merkleRootHash;      // Merkle root hash of the ZIP contents
        string encryptedHash;       // Hash of encrypted ZIP file (SHA-256, empty if unencrypted)
        string ipfsHash;            // IPFS hash where the ZIP file is stored
        address creator;            // Address that created/minted this token
        uint256 creationTimestamp;  // Timestamp when the ZIP was created (user-provided)
        uint256 tokenizationTime;   // Timestamp when the NFT was minted (block.timestamp)
        uint256 blockNumber;        // Block number when the token was minted
    }
    
    /**
     * @dev Timestamp proof extension data (for timestamp-enhanced tokens)
     */
    struct TimestampProofData {
        bool hasTimestampProof;     // True if this token has timestamp proof
        bytes32 batchMerkleRoot;    // TimestampRegistry batch merkle root
        uint256 batchTimestamp;     // When the batch was submitted
        uint256 batchBlockNumber;   // Block when batch was submitted
    }
    
    // ============================================================================
    // State Variables
    // ============================================================================
    
    /// @dev Reference to the NZIPTimestampReg contract (optional, for timestamp proof mode)
    NZIPTimestampReg public immutable registry;
    
    /// @dev Counter for token IDs
    uint256 private _tokenIdCounter;
    
    /// @dev Mapping from token ID to ZIP file information (v2.11 compatible)
    mapping(uint256 => ZipFileInfo) public zipFileInfo;
    
    /// @dev Mapping from composite key (merkleRoot + timestamp) to token ID
    mapping(bytes32 => uint256) public compositeKeyToTokenId;
    
    /// @dev Mapping from token ID to timestamp proof data (extension)
    mapping(uint256 => TimestampProofData) public timestampProofData;
    
    /// @dev Mapping of merkle proofs for timestamp proof tokens
    mapping(uint256 => bytes32[]) private _merkleProofs;
    
    /// @dev Minting fee in wei (default: 0.001 ETH, optional)
    uint256 public mintFee = 0.001 ether;
    
    /// @dev Mapping of addresses authorized to mint on behalf of users
    mapping(address => bool) public authorizedMinters;
    
    /// @dev Whether minting fee is required
    bool public mintFeeRequired = false;
    
    // ============================================================================
    // Events (neozipkit v2.11 compatible)
    // ============================================================================
    
    /// @dev Emitted when a ZIP file NFT is minted (v2.11 compatible)
    event ZipFileTokenized(
        uint256 indexed tokenId,
        address indexed creator,
        string merkleRootHash,
        string encryptedHash,
        uint256 creationTimestamp,
        string ipfsHash,
        uint256 tokenizationTime,
        uint256 blockNumber
    );
    
    /// @dev Emitted when a timestamp proof NFT is minted (extension)
    event TimestampProofMinted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 indexed batchMerkleRoot,
        string merkleRootHash,
        uint256 batchTimestamp,
        uint256 tokenizationTime,
        uint256 blockNumber
    );
    
    /// @dev Emitted when the mint fee is updated
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @dev Emitted when a minter is authorized
    event MinterAuthorized(address indexed minter, address indexed authorizedBy);
    
    /// @dev Emitted when a minter is deauthorized
    event MinterDeauthorized(address indexed minter, address indexed deauthorizedBy);
    
    // ============================================================================
    // Constructor
    // ============================================================================
    
    /**
     * @dev Initializes the NFT contract (v2.11 compatible name/symbol)
     * @param _registry Address of the TimestampRegistry contract (can be zero for simple mode only)
     */
    constructor(address _registry) 
        ERC721("NeoZip File NFT v2.50", "NZIP") 
        Ownable(msg.sender) 
    {
        // Registry is optional - can be zero address if only using simple mode
        registry = NZIPTimestampReg(_registry);
        
        // Owner is automatically an authorized minter
        authorizedMinters[msg.sender] = true;
        emit MinterAuthorized(msg.sender, msg.sender);
    }
    
    // ============================================================================
    // Admin Functions
    // ============================================================================
    
    /**
     * @dev Set the minting fee
     * @param newFee New fee in wei
     */
    function setMintFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = mintFee;
        mintFee = newFee;
        emit FeeUpdated(oldFee, newFee);
    }
    
    /**
     * @dev Set whether minting fee is required
     * @param required True if fee is required
     */
    function setMintFeeRequired(bool required) external onlyOwner {
        mintFeeRequired = required;
    }
    
    /**
     * @dev Withdraw accumulated fees
     * @param to Address to send fees to
     */
    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "NZIPNFT: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "NZIPNFT: no fees to withdraw");
        
        (bool success, ) = to.call{value: balance}("");
        require(success, "NZIPNFT: withdrawal failed");
    }
    
    /**
     * @dev Authorize an address to mint on behalf of users
     * @param minter Address to authorize
     */
    function authorizeMinter(address minter) external onlyOwner {
        require(minter != address(0), "NZIPNFT: zero address");
        require(!authorizedMinters[minter], "NZIPNFT: already authorized");
        
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter, msg.sender);
    }
    
    /**
     * @dev Deauthorize a minter
     * @param minter Address to deauthorize
     */
    function deauthorizeMinter(address minter) external onlyOwner {
        require(authorizedMinters[minter], "NZIPNFT: not authorized");
        
        authorizedMinters[minter] = false;
        emit MinterDeauthorized(minter, msg.sender);
    }
    
    // ============================================================================
    // Simple Minting (neozipkit v2.11 compatible)
    // ============================================================================
    
    /**
     * @dev Generate composite key from merkle root and timestamp (v2.11 compatible)
     * @param merkleRootHash The merkle root hash
     * @param creationTimestamp The creation timestamp
     * @return The composite key
     */
    function generateCompositeKey(
        string memory merkleRootHash, 
        uint256 creationTimestamp
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(merkleRootHash, creationTimestamp));
    }
    
    /**
     * @dev Public minting function for ZIP files (v2.10 compatible - no encrypted hash)
     * @param merkleRootHash Merkle root hash of the ZIP contents
     * @param creationTimestamp Timestamp when the ZIP was created
     * @param ipfsHash IPFS hash where the ZIP is stored
     * @param metadataURI URI for the token metadata
     * @return The newly minted token ID
     */
    function publicMintZipFile(
        string memory merkleRootHash,
        uint256 creationTimestamp,
        string memory ipfsHash,
        string memory metadataURI
    ) public payable returns (uint256) {
        return publicMintZipFile(merkleRootHash, "", creationTimestamp, ipfsHash, metadataURI);
    }
    
    /**
     * @dev Public minting function for ZIP files (v2.11 compatible)
     * @param merkleRootHash Merkle root hash of the ZIP contents
     * @param encryptedHash Optional hash of encrypted ZIP file (empty string if unencrypted)
     * @param creationTimestamp Timestamp when the ZIP was created
     * @param ipfsHash IPFS hash where the ZIP is stored
     * @param metadataURI URI for the token metadata
     * @return The newly minted token ID
     */
    function publicMintZipFile(
        string memory merkleRootHash,
        string memory encryptedHash,
        uint256 creationTimestamp,
        string memory ipfsHash,
        string memory metadataURI
    ) public payable nonReentrant returns (uint256) {
        // Check fee if required
        if (mintFeeRequired) {
            require(msg.value >= mintFee, "NZIPNFT: insufficient fee");
        }
        
        // Input validation
        require(bytes(merkleRootHash).length > 0, "Merkle root hash cannot be empty");
        require(creationTimestamp > 0, "Creation timestamp must be greater than 0");
        
        // Generate composite key to check for duplicates
        bytes32 compositeKey = generateCompositeKey(merkleRootHash, creationTimestamp);
        
        // Check if this exact combination already exists
        require(compositeKeyToTokenId[compositeKey] == 0, "ZIP file with this content and timestamp already tokenized");
        
        // Increment token counter
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        // Mint the NFT to the caller
        _safeMint(msg.sender, tokenId);
        
        // Set token URI if provided
        if (bytes(metadataURI).length > 0) {
            _setTokenURI(tokenId, metadataURI);
        }
        
        // Store the ZIP file information
        zipFileInfo[tokenId] = ZipFileInfo({
            merkleRootHash: merkleRootHash,
            encryptedHash: encryptedHash,
            ipfsHash: ipfsHash,
            creator: msg.sender,
            creationTimestamp: creationTimestamp,
            tokenizationTime: block.timestamp,
            blockNumber: block.number
        });
        
        // Store the composite key mapping
        compositeKeyToTokenId[compositeKey] = tokenId;
        
        // Note: timestampProofData[tokenId] is NOT initialized here
        // Solidity defaults hasTimestampProof to false, which is correct
        // This saves ~80,000 gas per simple mint
        
        // Emit v2.11 compatible event
        emit ZipFileTokenized(
            tokenId,
            msg.sender,
            merkleRootHash,
            encryptedHash,
            creationTimestamp,
            ipfsHash,
            block.timestamp,
            block.number
        );
        
        return tokenId;
    }
    
    // ============================================================================
    // Timestamp Proof Minting (Extension)
    // ============================================================================
    
    /**
     * @dev Mint an NFT with timestamp proof (requires TimestampRegistry verification)
     * @param merkleRootHash The merkle root hash of the ZIP (as string for compatibility)
     * @param proof The merkle proof path
     * @param batchMerkleRoot The merkle root of the batch in TimestampRegistry
     * @return tokenId The newly minted token ID
     */
    function mintWithTimestampProof(
        string memory merkleRootHash,
        bytes32[] calldata proof,
        bytes32 batchMerkleRoot
    ) external payable nonReentrant returns (uint256) {
        // Check fee if required
        if (mintFeeRequired) {
            require(msg.value >= mintFee, "NZIPNFT: insufficient fee");
        }
        
        require(bytes(merkleRootHash).length > 0, "NZIPNFT: empty merkle root");
        require(address(registry) != address(0), "NZIPNFT: registry not configured");
        
        // For proper merkle proof verification, we need the actual bytes32 digest
        // The user should pass the hex string without 0x prefix
        // Try to parse it as a hex string first
        bytes32 digest = _parseHexString(merkleRootHash);
        
        // Verify the proof against the registry
        (bool isValid, , uint256 batchTimestamp, uint256 batchBlockNumber) = registry.verifyProof(
            digest,
            proof,
            batchMerkleRoot
        );
        require(isValid, "NZIPNFT: invalid proof");
        
        // Use current timestamp as creationTimestamp for composite key
        uint256 creationTimestamp = batchTimestamp;
        bytes32 compositeKey = generateCompositeKey(merkleRootHash, creationTimestamp);
        require(compositeKeyToTokenId[compositeKey] == 0, "NZIPNFT: already minted");
        
        // Increment token counter
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        // Mint the NFT
        _safeMint(msg.sender, tokenId);
        
        // Store ZIP file info (v2.11 compatible)
        zipFileInfo[tokenId] = ZipFileInfo({
            merkleRootHash: merkleRootHash,
            encryptedHash: "",
            ipfsHash: "",
            creator: msg.sender,
            creationTimestamp: creationTimestamp,
            tokenizationTime: block.timestamp,
            blockNumber: block.number
        });
        
        // Store composite key
        compositeKeyToTokenId[compositeKey] = tokenId;
        
        // Store timestamp proof data
        timestampProofData[tokenId] = TimestampProofData({
            hasTimestampProof: true,
            batchMerkleRoot: batchMerkleRoot,
            batchTimestamp: batchTimestamp,
            batchBlockNumber: batchBlockNumber
        });
        
        // Store merkle proof
        _merkleProofs[tokenId] = proof;
        
        // Emit events
        emit ZipFileTokenized(
            tokenId,
            msg.sender,
            merkleRootHash,
            "",
            creationTimestamp,
            "",
            block.timestamp,
            block.number
        );
        
        emit TimestampProofMinted(
            tokenId,
            msg.sender,
            batchMerkleRoot,
            merkleRootHash,
            batchTimestamp,
            block.timestamp,
            block.number
        );
        
        return tokenId;
    }
    
    /**
     * @dev Parse a hex string to bytes32
     */
    function _parseHexString(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        uint256 start = 0;
        
        // Skip 0x prefix if present
        if (b.length >= 2 && b[0] == '0' && (b[1] == 'x' || b[1] == 'X')) {
            start = 2;
        }
        
        require(b.length - start == 64, "NZIPNFT: invalid hex length");
        
        bytes32 result;
        for (uint256 i = 0; i < 32; i++) {
            uint8 hi = _hexCharToByte(b[start + i * 2]);
            uint8 lo = _hexCharToByte(b[start + i * 2 + 1]);
            result = bytes32(uint256(result) | (uint256(hi * 16 + lo) << (248 - i * 8)));
        }
        
        return result;
    }
    
    function _hexCharToByte(bytes1 c) internal pure returns (uint8) {
        if (c >= '0' && c <= '9') return uint8(c) - uint8(bytes1('0'));
        if (c >= 'a' && c <= 'f') return 10 + uint8(c) - uint8(bytes1('a'));
        if (c >= 'A' && c <= 'F') return 10 + uint8(c) - uint8(bytes1('A'));
        revert("NZIPNFT: invalid hex char");
    }
    
    // ============================================================================
    // View Functions (neozipkit v2.11 compatible)
    // ============================================================================
    
    /**
     * @dev Get ZIP file information for a token (v2.11 compatible)
     * @param tokenId The token ID to query
     * @return ZipFileInfo struct containing all file and blockchain metadata
     */
    function getZipFileInfo(uint256 tokenId) external view returns (ZipFileInfo memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return zipFileInfo[tokenId];
    }
    
    /**
     * @dev Get encrypted hash for a token (v2.11 compatible)
     * @param tokenId The token ID to query
     * @return The encrypted hash (empty string if unencrypted)
     */
    function getEncryptedHash(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return zipFileInfo[tokenId].encryptedHash;
    }
    
    /**
     * @dev Check if a ZIP file is already tokenized (v2.11 compatible)
     * @param merkleRootHash The merkle root hash to check
     * @param creationTimestamp The creation timestamp to check
     * @return exists Whether the combination exists
     * @return tokenId The token ID if it exists (0 if not)
     */
    function isZipFileTokenized(
        string memory merkleRootHash, 
        uint256 creationTimestamp
    ) external view returns (bool exists, uint256 tokenId) {
        bytes32 compositeKey = generateCompositeKey(merkleRootHash, creationTimestamp);
        tokenId = compositeKeyToTokenId[compositeKey];
        exists = tokenId != 0;
    }
    
    /**
     * @dev Verify that a token matches the provided merkle root (v2.11 compatible)
     * @param tokenId The token ID to verify
     * @param providedMerkleRoot The merkle root to check against
     * @return isValid Whether the token matches the provided merkle root
     */
    function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        return keccak256(abi.encodePacked(zipFileInfo[tokenId].merkleRootHash)) == 
               keccak256(abi.encodePacked(providedMerkleRoot));
    }
    
    /**
     * @dev Verify that a token matches the provided encrypted hash (v2.11 compatible)
     * @param tokenId The token ID to verify
     * @param providedEncryptedHash The encrypted hash to check against
     * @return isValid Whether the token matches the provided encrypted hash
     */
    function verifyEncryptedZipFile(
        uint256 tokenId,
        string memory providedEncryptedHash
    ) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        if (bytes(zipFileInfo[tokenId].encryptedHash).length == 0) {
            return false;
        }
        
        return keccak256(abi.encodePacked(zipFileInfo[tokenId].encryptedHash)) == 
               keccak256(abi.encodePacked(providedEncryptedHash));
    }
    
    /**
     * @dev Get blockchain metadata for a token (v2.11 compatible)
     * @param tokenId The token ID to query
     * @return blockNumber Block number when token was minted
     * @return tokenizationTime Exact timestamp when token was minted
     */
    function getBlockchainMetadata(uint256 tokenId) public view returns (
        uint256 blockNumber,
        uint256 tokenizationTime
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        ZipFileInfo memory info = zipFileInfo[tokenId];
        return (info.blockNumber, info.tokenizationTime);
    }
    
    // ============================================================================
    // View Functions (Timestamp Proof Extension)
    // ============================================================================
    
    /**
     * @dev Check if a token has timestamp proof
     * @param tokenId The token ID to check
     * @return True if the token was minted with timestamp proof
     */
    function hasTimestampProof(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        return timestampProofData[tokenId].hasTimestampProof;
    }
    
    /**
     * @dev Get timestamp proof data for a token
     * @param tokenId The token ID to query
     * @return data The TimestampProofData struct
     * @return merkleProof The merkle proof array
     */
    function getTimestampProof(uint256 tokenId) external view returns (
        TimestampProofData memory data,
        bytes32[] memory merkleProof
    ) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        return (timestampProofData[tokenId], _merkleProofs[tokenId]);
    }
    
    /**
     * @dev Get token data in a unified format (for verify-zip.ts compatibility)
     * @param tokenId The token ID to query
     * @return merkleRoot The merkle root hash
     * @return mintedAt Block timestamp when minted
     * @return mintBlockNumber Block number when minted
     * @return originalOwner Original minter address
     * @return hasProof Whether token has timestamp proof
     * @return batchMerkleRoot Batch merkle root (if has proof)
     * @return batchTimestamp Batch timestamp (if has proof)
     * @return batchBlockNumber Batch block number (if has proof)
     */
    function getTokenData(uint256 tokenId) external view returns (
        bytes32 merkleRoot,
        uint256 mintedAt,
        uint256 mintBlockNumber,
        address originalOwner,
        bool hasProof,
        bytes32 batchMerkleRoot,
        uint256 batchTimestamp,
        uint256 batchBlockNumber
    ) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        
        ZipFileInfo memory info = zipFileInfo[tokenId];
        TimestampProofData memory proof = timestampProofData[tokenId];
        
        return (
            _parseHexString(info.merkleRootHash),
            info.tokenizationTime,
            info.blockNumber,
            info.creator,
            proof.hasTimestampProof,
            proof.batchMerkleRoot,
            proof.batchTimestamp,
            proof.batchBlockNumber
        );
    }
    
    /**
     * @dev Verify that a token's timestamp proof is still valid
     * @param tokenId The token ID to verify
     * @return isValid True if valid (or if token has no timestamp proof)
     */
    function verifyToken(uint256 tokenId) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        
        TimestampProofData memory proof = timestampProofData[tokenId];
        
        // If no timestamp proof, token is always "valid"
        if (!proof.hasTimestampProof) {
            return true;
        }
        
        // Verify against registry
        ZipFileInfo memory info = zipFileInfo[tokenId];
        bytes32 digest = _parseHexString(info.merkleRootHash);
        bytes32[] memory merkleProof = _merkleProofs[tokenId];
        
        (isValid, , , ) = registry.verifyProof(digest, merkleProof, proof.batchMerkleRoot);
        return isValid;
    }
    
    /**
     * @dev Get total supply of minted tokens
     * @return The total number of tokens minted
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @dev Get contract version
     * @return version The version string
     */
    function getVersion() external pure returns (string memory) {
        return "2.50.0";
    }
    
    /**
     * @dev Check if an address is an authorized minter
     * @param minter Address to check
     * @return True if authorized
     */
    function isAuthorizedMinter(address minter) external view returns (bool) {
        return authorizedMinters[minter];
    }
    
    /**
     * @dev Get the registry address
     * @return The TimestampRegistry contract address
     */
    function getRegistry() external view returns (address) {
        return address(registry);
    }
    
    // ============================================================================
    // ERC721 Overrides
    // ============================================================================
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    /**
     * @dev Set token URI (owner only)
     */
    function setTokenURI(uint256 tokenId, string memory _tokenURI) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        _setTokenURI(tokenId, _tokenURI);
    }
}
