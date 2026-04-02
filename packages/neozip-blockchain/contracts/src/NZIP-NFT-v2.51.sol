// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./NZIP-TimestampReg-v0.90.sol";

/**
 * @title NZIPNFT v2.51 (ZipFileNFTPublic compatible)
 * @dev NZIP ERC-721 NFT contract for NeoZip tokenized ZIP files.
 *
 * v2.51: Digest-only identity. No composite key; creationTimestamp is metadata only (link to Zipstamp).
 * Multiple tokens per merkle root allowed; client suggests original (earliest) or user's token.
 *
 * Two minting modes:
 * 1. Simple tokenization - publicMintZipFile()
 *    - creationTimestamp >= 0 (use 0 for no prior timestamp link)
 * 2. Timestamp proof minting - mintWithTimestampProof()
 *    - Links to TimestampRegistry batch; creationTimestamp = batchTimestamp (metadata).
 *
 * Version: 2.51.0
 */
contract NZIPNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {

    struct ZipFileInfo {
        string merkleRootHash;
        string encryptedHash;
        string ipfsHash;
        address creator;
        uint256 creationTimestamp;  // Metadata only: link to prior Zipstamp; 0 = none
        uint256 tokenizationTime;
        uint256 blockNumber;
    }

    struct TimestampProofData {
        bool hasTimestampProof;
        bytes32 batchMerkleRoot;
        uint256 batchTimestamp;
        uint256 batchBlockNumber;
    }

    NZIPTimestampReg public immutable registry;
    uint256 private _tokenIdCounter;
    mapping(uint256 => ZipFileInfo) public zipFileInfo;
    mapping(uint256 => TimestampProofData) public timestampProofData;
    mapping(uint256 => bytes32[]) private _merkleProofs;
    uint256 public mintFee = 0.001 ether;
    mapping(address => bool) public authorizedMinters;
    bool public mintFeeRequired = false;

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
    event TimestampProofMinted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 indexed batchMerkleRoot,
        string merkleRootHash,
        uint256 batchTimestamp,
        uint256 tokenizationTime,
        uint256 blockNumber
    );
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event MinterAuthorized(address indexed minter, address indexed authorizedBy);
    event MinterDeauthorized(address indexed minter, address indexed deauthorizedBy);

    constructor(address _registry)
        ERC721("NeoZip File NFT v2.51", "NZIP")
        Ownable(msg.sender)
    {
        registry = NZIPTimestampReg(_registry);
        authorizedMinters[msg.sender] = true;
        emit MinterAuthorized(msg.sender, msg.sender);
    }

    function setMintFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = mintFee;
        mintFee = newFee;
        emit FeeUpdated(oldFee, newFee);
    }

    function setMintFeeRequired(bool required) external onlyOwner {
        mintFeeRequired = required;
    }

    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "NZIPNFT: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "NZIPNFT: no fees to withdraw");
        (bool success, ) = to.call{value: balance}("");
        require(success, "NZIPNFT: withdrawal failed");
    }

    function authorizeMinter(address minter) external onlyOwner {
        require(minter != address(0), "NZIPNFT: zero address");
        require(!authorizedMinters[minter], "NZIPNFT: already authorized");
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter, msg.sender);
    }

    function deauthorizeMinter(address minter) external onlyOwner {
        require(authorizedMinters[minter], "NZIPNFT: not authorized");
        authorizedMinters[minter] = false;
        emit MinterDeauthorized(minter, msg.sender);
    }

    function publicMintZipFile(
        string memory merkleRootHash,
        uint256 creationTimestamp,
        string memory ipfsHash,
        string memory metadataURI
    ) public payable returns (uint256) {
        return publicMintZipFile(merkleRootHash, "", creationTimestamp, ipfsHash, metadataURI);
    }

    function publicMintZipFile(
        string memory merkleRootHash,
        string memory encryptedHash,
        uint256 creationTimestamp,
        string memory ipfsHash,
        string memory metadataURI
    ) public payable nonReentrant returns (uint256) {
        if (mintFeeRequired) {
            require(msg.value >= mintFee, "NZIPNFT: insufficient fee");
        }
        require(bytes(merkleRootHash).length > 0, "Merkle root hash cannot be empty");

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);
        if (bytes(metadataURI).length > 0) {
            _setTokenURI(tokenId, metadataURI);
        }

        zipFileInfo[tokenId] = ZipFileInfo({
            merkleRootHash: merkleRootHash,
            encryptedHash: encryptedHash,
            ipfsHash: ipfsHash,
            creator: msg.sender,
            creationTimestamp: creationTimestamp,
            tokenizationTime: block.timestamp,
            blockNumber: block.number
        });

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

    function mintWithTimestampProof(
        string memory merkleRootHash,
        bytes32[] calldata proof,
        bytes32 batchMerkleRoot
    ) external payable nonReentrant returns (uint256) {
        if (mintFeeRequired) {
            require(msg.value >= mintFee, "NZIPNFT: insufficient fee");
        }
        require(bytes(merkleRootHash).length > 0, "NZIPNFT: empty merkle root");
        require(address(registry) != address(0), "NZIPNFT: registry not configured");

        bytes32 digest = _parseHexString(merkleRootHash);
        (bool isValid, , uint256 batchTimestamp, uint256 batchBlockNumber) = registry.verifyProof(
            digest,
            proof,
            batchMerkleRoot
        );
        require(isValid, "NZIPNFT: invalid proof");

        uint256 creationTimestamp = batchTimestamp;

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);
        zipFileInfo[tokenId] = ZipFileInfo({
            merkleRootHash: merkleRootHash,
            encryptedHash: "",
            ipfsHash: "",
            creator: msg.sender,
            creationTimestamp: creationTimestamp,
            tokenizationTime: block.timestamp,
            blockNumber: block.number
        });
        timestampProofData[tokenId] = TimestampProofData({
            hasTimestampProof: true,
            batchMerkleRoot: batchMerkleRoot,
            batchTimestamp: batchTimestamp,
            batchBlockNumber: batchBlockNumber
        });
        _merkleProofs[tokenId] = proof;

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

    function _parseHexString(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        uint256 start = 0;
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

    function getZipFileInfo(uint256 tokenId) external view returns (ZipFileInfo memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return zipFileInfo[tokenId];
    }

    function getEncryptedHash(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return zipFileInfo[tokenId].encryptedHash;
    }

    /**
     * @dev Get all token IDs with the given merkle root (by digest only). Order = tokenId ascending (earliest first).
     */
    function getTokensByMerkleRoot(string memory merkleRootHash) external view returns (uint256[] memory tokenIds) {
        uint256[] memory temp = new uint256[](_tokenIdCounter);
        uint256 count = 0;
        bytes32 want = keccak256(abi.encodePacked(merkleRootHash));
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) != address(0) && keccak256(abi.encodePacked(zipFileInfo[i].merkleRootHash)) == want) {
                temp[count] = i;
                count++;
            }
        }
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            tokenIds[i] = temp[i];
        }
    }

    /**
     * @dev Check if any token has this merkle root and creation timestamp (iteration; no composite key).
     */
    function isZipFileTokenized(
        string memory merkleRootHash,
        uint256 creationTimestamp
    ) external view returns (bool exists, uint256 tokenId) {
        bytes32 wantRoot = keccak256(abi.encodePacked(merkleRootHash));
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) == address(0)) continue;
            ZipFileInfo memory info = zipFileInfo[i];
            if (keccak256(abi.encodePacked(info.merkleRootHash)) == wantRoot && info.creationTimestamp == creationTimestamp) {
                return (true, i);
            }
        }
        return (false, 0);
    }

    function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return keccak256(abi.encodePacked(zipFileInfo[tokenId].merkleRootHash)) ==
               keccak256(abi.encodePacked(providedMerkleRoot));
    }

    function verifyEncryptedZipFile(
        uint256 tokenId,
        string memory providedEncryptedHash
    ) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (bytes(zipFileInfo[tokenId].encryptedHash).length == 0) return false;
        return keccak256(abi.encodePacked(zipFileInfo[tokenId].encryptedHash)) ==
               keccak256(abi.encodePacked(providedEncryptedHash));
    }

    function getBlockchainMetadata(uint256 tokenId) public view returns (
        uint256 blockNumber,
        uint256 tokenizationTime
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        ZipFileInfo memory info = zipFileInfo[tokenId];
        return (info.blockNumber, info.tokenizationTime);
    }

    function hasTimestampProof(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        return timestampProofData[tokenId].hasTimestampProof;
    }

    function getTimestampProof(uint256 tokenId) external view returns (
        TimestampProofData memory data,
        bytes32[] memory merkleProof
    ) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        return (timestampProofData[tokenId], _merkleProofs[tokenId]);
    }

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

    function verifyToken(uint256 tokenId) external view returns (bool isValid) {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        TimestampProofData memory proof = timestampProofData[tokenId];
        if (!proof.hasTimestampProof) return true;
        ZipFileInfo memory info = zipFileInfo[tokenId];
        bytes32 digest = _parseHexString(info.merkleRootHash);
        bytes32[] memory merkleProof = _merkleProofs[tokenId];
        (isValid, , , ) = registry.verifyProof(digest, merkleProof, proof.batchMerkleRoot);
        return isValid;
    }

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getVersion() external pure returns (string memory) {
        return "2.51.0";
    }

    function isAuthorizedMinter(address minter) external view returns (bool) {
        return authorizedMinters[minter];
    }

    function getRegistry() external view returns (address) {
        return address(registry);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function setTokenURI(uint256 tokenId, string memory _tokenURI) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "NZIPNFT: token does not exist");
        _setTokenURI(tokenId, _tokenURI);
    }
}
