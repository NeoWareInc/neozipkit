// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NZIP NFT Contract v2.0
 * @dev Main NFT contract for tokenizing ZIP files with blockchain metadata
 * Features:
 * - Blockchain metadata (block number, timestamps) 
 * - Multiple tokens allowed for same content (differentiated by timestamp)
 * - Enhanced events with blockchain context
 * - Structured data organization for better maintainability
 * - Improved input validation and error handling
 * - Removed unreliable block hash storage
 * 
 * Version: 2.0 (New Production Contract - Previous contract deprecated)
 * Previous Contract: 0xb78CB3bcC788fca38c731b1E9D70CF60b04CA015 (DEPRECATED)
 * Network: Base Sepolia (for testing) / Base Mainnet (for production)
 */
contract ZipFileNFT is ERC721, ERC721URIStorage, Ownable {
    
    // Counter for token IDs
    uint256 private _tokenIdCounter;
    
    // Struct to store ZIP file information - Latest Version
    struct ZipFileInfo {
        // File identification
        string fileName;           // Original ZIP file name
        string merkleRootHash;     // Merkle root hash of the ZIP contents
        string ipfsHash;           // IPFS hash where the ZIP file is stored
        address creator;           // Address that created/minted this token
        
        // Timestamps (grouped together)
        uint256 creationTimestamp; // Timestamp when the ZIP was created (user-provided)
        uint256 tokenizationTime;  // Timestamp when the NFT was minted (block.timestamp)
        
        // Blockchain metadata
        uint256 blockNumber;       // Block number when the token was minted
    }
    
    // Mapping from token ID to ZIP file information
    mapping(uint256 => ZipFileInfo) public zipFileInfo;
    
    // Mapping from composite key (merkleRoot + timestamp) to token ID
    // This prevents duplicate tokens with same content AND same timestamp
    mapping(bytes32 => uint256) public compositeKeyToTokenId;
    
    // Events - Enhanced with blockchain metadata
    event ZipFileTokenized(
        uint256 indexed tokenId,
        address indexed creator,
        string fileName,
        string merkleRootHash,
        uint256 creationTimestamp,
        string ipfsHash,
        uint256 tokenizationTime,
        uint256 blockNumber
    );
    
    constructor() ERC721("NeoZip File NFT v2", "NZIP") Ownable(msg.sender) {}
    
    /**
     * @dev Get the contract version
     * @return version The version string of this contract
     */
    function getVersion() public pure returns (string memory) {
        return "2.0.0";
    }
    
    /**
     * @dev Generate composite key from merkle root and timestamp
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
     * @dev Public minting function for ZIP files
     * @param fileName Name of the ZIP file
     * @param merkleRootHash Merkle root hash of the ZIP contents
     * @param creationTimestamp Timestamp when the ZIP was created
     * @param ipfsHash IPFS hash where the ZIP is stored
     * @param metadataURI URI for the token metadata
     * @return The newly minted token ID
     */
    function publicMintZipFile(
        string memory fileName,
        string memory merkleRootHash,
        uint256 creationTimestamp,
        string memory ipfsHash,
        string memory metadataURI
    ) public returns (uint256) {
        // Input validation
        require(bytes(fileName).length > 0, "File name cannot be empty");
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
        
        // Store the ZIP file information with blockchain metadata
        zipFileInfo[tokenId] = ZipFileInfo({
            fileName: fileName,
            merkleRootHash: merkleRootHash,
            ipfsHash: ipfsHash,
            creator: msg.sender,
            creationTimestamp: creationTimestamp,
            tokenizationTime: block.timestamp,
            blockNumber: block.number
        });
        
        // Store the composite key mapping
        compositeKeyToTokenId[compositeKey] = tokenId;
        
        // Emit event with blockchain metadata
        emit ZipFileTokenized(
            tokenId,
            msg.sender,
            fileName,
            merkleRootHash,
            creationTimestamp,
            ipfsHash,
            block.timestamp,
            block.number
        );
        
        return tokenId;
    }
    
    /**
     * @dev Get ZIP file information for a token
     * @param tokenId The token ID to query
     * @return ZipFileInfo struct containing all file and blockchain metadata
     */
    function getZipFileInfo(uint256 tokenId) external view returns (ZipFileInfo memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return zipFileInfo[tokenId];
    }
    
    /**
     * @dev Check if a ZIP file is already tokenized
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
     * @dev Get all token IDs for a specific merkle root (across all timestamps)
     * @param merkleRoot The merkle root to search for
     * @return tokenIds Array of token IDs with this merkle root
     */
    function getTokensByMerkleRoot(string memory merkleRoot) external view returns (uint256[] memory) {
        // Create dynamic array to collect matching tokens
        uint256[] memory tempTokens = new uint256[](_tokenIdCounter);
        uint256 count = 0;
        
        // Search through all tokens
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) != address(0)) { // Token exists
                if (keccak256(abi.encodePacked(zipFileInfo[i].merkleRootHash)) == 
                    keccak256(abi.encodePacked(merkleRoot))) {
                    tempTokens[count] = i;
                    count++;
                }
            }
        }
        
        // Create result array with exact size
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tempTokens[i];
        }
        
        return result;
    }
    
    /**
     * @dev Verify that a token matches the provided merkle root
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
     * @dev Get the current total supply of tokens
     * @return The total number of tokens minted
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @dev Get the balance of tokens for an address
     * @param owner The address to query
     * @return The number of tokens owned by the address
     */
    function balanceOf(address owner) public view override(ERC721, IERC721) returns (uint256) {
        require(owner != address(0), "ERC721: address zero is not a valid owner");
        return super.balanceOf(owner);
    }
    
    /**
     * @dev Get blockchain metadata for a token
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
    
    // Override required by Solidity
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    // Override required by Solidity
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 