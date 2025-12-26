# Blockchain Contract Upgrade Strategy v3.0+

## Document Purpose

This document outlines the comprehensive upgrade strategy for the NZIP-NFT smart contract system. It provides detailed specifications, implementation guidelines, and architectural decisions for future blockchain contract development.

**Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Status:** Phase 1 Complete, Phases 2-4 Planned

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Phase 1: Encrypted Hash Support](#phase-1-encrypted-hash-support)
4. [Phase 2: Creator Identity Management](#phase-2-creator-identity-management)
5. [Phase 3: Smart Contract Control Mechanisms](#phase-3-smart-contract-control-mechanisms)
6. [Phase 4: Advanced Features](#phase-4-advanced-features)
7. [Implementation Strategy](#implementation-strategy)
8. [Security Considerations](#security-considerations)
9. [Gas Optimization](#gas-optimization)
10. [Migration Strategy](#migration-strategy)
11. [Testing Strategy](#testing-strategy)
12. [Future Considerations](#future-considerations)

---

## Executive Summary

The NZIP-NFT contract upgrade strategy introduces four major phases of enhancements:

1. **Phase 1 (v3.0)**: Encrypted ZIP file hash verification and Service Token upgrade support - **COMPLETE**
2. **Phase 2 (v3.1+)**: Creator identity management and registry system
3. **Phase 3 (v3.2+)**: Smart contract-based access control and governance
4. **Phase 4 (v3.3+)**: Advanced features including token relationships, access logging, and multi-chain support

Each phase builds upon the previous, maintaining backward compatibility while adding new capabilities. The upgrade path is designed to be incremental, allowing for gradual adoption and testing.

---

## Current State Analysis

### Contract v2.0/v2.10 Features

**Current Storage Structure:**
```solidity
struct ZipFileInfo {
    string fileName;           // Original ZIP file name (v2.0 only, removed in v2.10)
    string merkleRootHash;     // Merkle root hash of unencrypted ZIP contents
    string ipfsHash;           // IPFS hash where ZIP is stored
    address creator;           // Address that created/minted token
    uint256 creationTimestamp; // User-provided creation timestamp
    uint256 tokenizationTime;  // Block timestamp when minted
    uint256 blockNumber;       // Block number when minted
}
```

**Current Capabilities:**
- ✅ ZIP file tokenization as ERC-721 NFTs
- ✅ Merkle root verification for file integrity
- ✅ Duplicate prevention via composite key system
- ✅ Blockchain metadata storage (block number, timestamps)
- ✅ Universal verification (anyone can verify tokens)
- ✅ Multiple tokens allowed for same content (differentiated by timestamp)

**Current Limitations:**
- ❌ Cannot verify encrypted ZIP files before decryption
- ❌ No way to verify ZIP integrity when files are encrypted
- ❌ Creator identity limited to address (no identity management)
- ❌ No access control or governance mechanisms
- ❌ No way for smart contracts to control ZIP data
- ❌ No token relationships or versioning
- ❌ No access logging or audit trails

---

## Phase 1: Encrypted Hash Support & Service Token Upgrade

### Status: ✅ COMPLETE (v3.0)

### Overview

Phase 1 adds support for verifying encrypted ZIP files without requiring decryption, and enables upgrading service tokens (from the Token Service Server) to dedicated NFT tokens. This enables integrity checking of encrypted archives before attempting to decrypt them, and provides a migration path from aggregated service tokens to full token ownership.

### Implementation Details

#### 1.1 Contract Changes

**New Fields in ZipFileInfo:**
```solidity
struct ZipFileInfo {
    // ... existing fields ...
    string encryptedHash;      // Hash of encrypted ZIP file (SHA-256 of encrypted bytes)
    // service upgrade fields
    string serviceTxHash;      // Original service batch transaction hash (if upgraded from service)
    uint256 serviceBlockNumber; // Original service batch block number
    uint256 serviceBlockTime;  // Original service batch timestamp (preserves original timestamp)
    string batchId;            // Original service batch ID
    bool isUpgraded;           // Flag indicating token was upgraded from service token
}
```

**Key Design Decisions:**
- `encryptedHash` is optional (empty string indicates unencrypted ZIP)
- Only the hash is stored, not encryption method or password requirements
- Encryption details remain in the ZIP file itself for security
- Dual hash system: `merkleRootHash` for unencrypted, `encryptedHash` for encrypted
- Service token upgrade fields preserve original timestamp and service transaction reference
- `isUpgraded` flag distinguishes upgraded tokens from direct mints

**Updated Functions:**
```solidity
function publicMintZipFile(
    string memory fileName,
    string memory merkleRootHash,
    string memory encryptedHash,  // NEW: Optional encrypted hash
    uint256 creationTimestamp,
    string memory ipfsHash,
    string memory metadataURI
) public returns (uint256)

function mintFromServiceToken(
    string memory merkleRootHash,
    string memory encryptedHash,
    string memory serviceTxHash,      // NEW: Original service batch transaction
    uint256 serviceBlockNumber,       // NEW: Original service batch block number
    uint256 serviceBlockTime,         // NEW: Original service batch timestamp
    string memory batchId,            // NEW: Original service batch ID
    string memory ipfsHash,
    string memory metadataURI
) public returns (uint256)

function verifyEncryptedZipFile(
    uint256 tokenId,
    string memory providedEncryptedHash
) external view returns (bool isValid)

function getServiceTokenInfo(uint256 tokenId) 
    external 
    view 
    returns (
        string memory serviceTxHash,
        uint256 serviceBlockNumber,
        uint256 serviceBlockTime,
        string memory batchId,
        bool isUpgraded
    )
```

**Updated Event:**
```solidity
event ZipFileTokenized(
    uint256 indexed tokenId,
    address indexed creator,
    string fileName,
    string merkleRootHash,
    string encryptedHash,  // NEW: Encrypted hash field
    uint256 creationTimestamp,
    string ipfsHash,
    uint256 tokenizationTime,
    uint256 blockNumber
);

event TokenUpgraded(
    uint256 indexed tokenId,
    string indexed serviceTxHash,  // NEW: Original service transaction
    uint256 serviceBlockTime,      // NEW: Original timestamp
    uint256 upgradeTime            // NEW: Upgrade timestamp
);
```

#### 1.2 Use Cases

**Use Case 1: Encrypted ZIP Verification**
```
1. User receives encrypted ZIP file
2. Calculate SHA-256 hash of encrypted ZIP bytes
3. Call verifyEncryptedZipFile(tokenId, calculatedHash)
4. If valid, proceed with decryption
5. After decryption, verify merkleRootHash matches
```

**Use Case 2: Dual Verification**
```
1. Verify encryptedHash matches before decryption
2. Decrypt ZIP file
3. Verify merkleRootHash matches after decryption
4. Complete integrity chain: encrypted → decrypted → contents
```

**Use Case 3: Unencrypted ZIP (Backward Compatible)**
```
1. encryptedHash is empty string
2. Only merkleRootHash verification is used
3. Works identically to v2.0 contracts
```

#### 1.3 Service Token Upgrade

**Overview:**
The service token upgrade system allows users to convert aggregated service tokens (from the Token Service Server) into dedicated NFT tokens while preserving the original timestamp and service transaction reference. This provides a migration path from free/low-cost service tokenization to full token ownership.

**Upgrade Function:**
```solidity
function mintFromServiceToken(
    string memory merkleRootHash,
    string memory encryptedHash,
    string memory serviceTxHash,      // Original batch transaction
    uint256 serviceBlockNumber,       // Original batch block number
    uint256 serviceBlockTime,         // Original batch timestamp
    string memory batchId,            // Original batch ID
    string memory ipfsHash,
    string memory metadataURI
) public returns (uint256)
```

**Query Functions:**
```solidity
function getServiceTokenInfo(uint256 tokenId) 
    external 
    view 
    returns (
        string memory serviceTxHash,
        uint256 serviceBlockNumber,
        uint256 serviceBlockTime,
        string memory batchId,
        bool isUpgraded
    )

function isServiceTokenUpgraded(
    string memory merkleRootHash,
    uint256 serviceBlockTime
) external view returns (bool, uint256)
```

**Upgrade Verification Process:**
1. Query token for service transaction reference
2. Verify service transaction exists in aggregation contract
3. Verify Merkle root matches service batch
4. Confirm original timestamp is preserved
5. Validate upgrade timestamp is after original

**Use Cases:**
- **Gradual Adoption:** Users start with free service token, upgrade to NFT when ready
- **Cost Optimization:** Use service for initial tokenization, upgrade later when gas fees are lower
- **Marketplace Integration:** Service tokens are proofs, upgrade enables NFT marketplace listing
- **Compliance and Audit:** Original timestamp for legal purposes, complete audit trail

#### 1.4 SDK Integration

**TypeScript Changes:**
- `TokenMetadata` interface includes optional `encryptedHash?: string`
- `ZipkitMinter` constructor accepts `encryptedHash` parameter
- `ZipkitVerifier` includes `verifyEncryptedHash()` method
- Backward compatibility maintained for v2.0 contracts

**Example Usage:**
```typescript
// Calculate encrypted hash before minting
const encryptedZipBuffer = fs.readFileSync('encrypted.zip');
const encryptedHash = createHash('sha256').update(encryptedZipBuffer).digest('hex');

// Mint with encrypted hash
const minter = new ZipkitMinter(merkleRoot, {
  walletPrivateKey: process.env.PRIVATE_KEY,
  network: 'base-sepolia',
  encryptedHash: encryptedHash  // NEW: Include encrypted hash
});

const result = await minter.mintToken();

// Verify encrypted hash
const verifier = new ZipkitVerifier({ debug: true });
const encryptedResult = await verifier.verifyEncryptedHash(
  tokenId,
  contractAddress,
  networkConfig,
  encryptedHash
);
```

#### 1.5 Security Considerations

**Hash Calculation:**
- Use SHA-256 for encrypted hash (standard, secure)
- Hash must be calculated on raw encrypted bytes (before any processing)
- Hash should be calculated client-side before minting

**Verification Flow:**
- Always verify encrypted hash before attempting decryption
- If encrypted hash doesn't match, do not attempt decryption
- After decryption, verify merkle root for complete integrity chain

**Privacy:**
- Encrypted hash reveals nothing about file contents
- Only verifies that encrypted file matches tokenized version
- Encryption method and password remain in ZIP file

#### 1.6 Gas Costs

**Storage Costs:**
- `encryptedHash` (string): ~32 bytes (SHA-256 hex) + string overhead
- Estimated additional gas per mint: ~5,000-10,000 gas
- One-time cost, no recurring fees

**Verification Costs:**
- `verifyEncryptedZipFile()`: ~2,500-3,500 gas (view function, no state change)
- Comparable to existing `verifyZipFile()` function

**Service Token Upgrade Costs:**
- `mintFromServiceToken()`: ~150,000-200,000 gas (similar to regular mint)
- `getServiceTokenInfo()`: ~2,000-3,000 gas (view function)
- `isServiceTokenUpgraded()`: ~2,000-3,000 gas (view function)

---

## Phase 2: Creator Identity Management

### Status: 🔄 PLANNED (v3.1+)

### Overview

Phase 2 introduces a creator registry system that links creator addresses to unique identities, enabling reputation systems, verification, and identity migration.

### 2.1 Creator Registry Contract

**New Contract: `CreatorRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Creator Registry
 * @dev Manages creator identities and metadata
 */
contract CreatorRegistry is Ownable {
    struct CreatorIdentity {
        address creatorAddress;      // Current address for this creator
        string creatorId;            // Unique creator identifier (DID, ENS, custom)
        string metadataURI;          // IPFS/Arweave URI for creator metadata
        uint256 registrationTime;    // When identity was registered
        bool isVerified;             // KYC/verification status
        address verifiedBy;          // Address that verified (if applicable)
        uint256 verificationTime;    // When verification occurred
    }
    
    // Mapping from address to identity
    mapping(address => CreatorIdentity) public creators;
    
    // Mapping from creator ID to address (reverse lookup)
    mapping(string => address) public creatorIdToAddress;
    
    // Mapping of verified creators (for easy enumeration)
    mapping(address => bool) public verifiedCreators;
    
    // Events
    event CreatorRegistered(
        address indexed creatorAddress,
        string indexed creatorId,
        uint256 registrationTime
    );
    
    event CreatorVerified(
        address indexed creatorAddress,
        string indexed creatorId,
        address indexed verifiedBy,
        uint256 verificationTime
    );
    
    event CreatorAddressUpdated(
        address indexed oldAddress,
        address indexed newAddress,
        string indexed creatorId
    );
    
    /**
     * @dev Register a new creator identity
     * @param creatorId Unique identifier (must be unique)
     * @param metadataURI IPFS/Arweave URI for metadata
     */
    function registerCreator(
        string memory creatorId,
        string memory metadataURI
    ) external {
        require(bytes(creatorId).length > 0, "Creator ID cannot be empty");
        require(creatorIdToAddress[creatorId] == address(0), "Creator ID already exists");
        require(creators[msg.sender].creatorAddress == address(0), "Address already registered");
        
        creators[msg.sender] = CreatorIdentity({
            creatorAddress: msg.sender,
            creatorId: creatorId,
            metadataURI: metadataURI,
            registrationTime: block.timestamp,
            isVerified: false,
            verifiedBy: address(0),
            verificationTime: 0
        });
        
        creatorIdToAddress[creatorId] = msg.sender;
        
        emit CreatorRegistered(msg.sender, creatorId, block.timestamp);
    }
    
    /**
     * @dev Update creator address (identity migration)
     * @param newAddress New address for this creator
     */
    function updateCreatorAddress(address newAddress) external {
        require(newAddress != address(0), "Invalid address");
        require(creators[msg.sender].creatorAddress != address(0), "Creator not registered");
        
        string memory creatorId = creators[msg.sender].creatorId;
        CreatorIdentity memory identity = creators[msg.sender];
        
        // Update mappings
        delete creators[msg.sender];
        delete creatorIdToAddress[creatorId];
        
        identity.creatorAddress = newAddress;
        creators[newAddress] = identity;
        creatorIdToAddress[creatorId] = newAddress;
        
        emit CreatorAddressUpdated(msg.sender, newAddress, creatorId);
    }
    
    /**
     * @dev Verify a creator (owner only)
     * @param creatorAddress Address to verify
     */
    function verifyCreator(address creatorAddress) external onlyOwner {
        require(creators[creatorAddress].creatorAddress != address(0), "Creator not registered");
        
        creators[creatorAddress].isVerified = true;
        creators[creatorAddress].verifiedBy = msg.sender;
        creators[creatorAddress].verificationTime = block.timestamp;
        verifiedCreators[creatorAddress] = true;
        
        emit CreatorVerified(
            creatorAddress,
            creators[creatorAddress].creatorId,
            msg.sender,
            block.timestamp
        );
    }
    
    /**
     * @dev Get creator identity by address
     */
    function getCreator(address creatorAddress) external view returns (CreatorIdentity memory) {
        return creators[creatorAddress];
    }
    
    /**
     * @dev Get creator address by ID
     */
    function getCreatorById(string memory creatorId) external view returns (address) {
        return creatorIdToAddress[creatorId];
    }
}
```

### 2.2 Main Contract Integration

**Enhanced ZipFileInfo:**
```solidity
struct ZipFileInfo {
    // ... existing fields ...
    address creator;               // Creator address (existing)
    string creatorId;              // Creator unique ID (NEW)
    address creatorRegistry;       // Address of creator registry contract (NEW)
}
```

**Updated Minting Function:**
```solidity
function publicMintZipFile(
    string memory fileName,
    string memory merkleRootHash,
    string memory encryptedHash,
    uint256 creationTimestamp,
    string memory ipfsHash,
    string memory metadataURI,
    string memory creatorId,       // NEW: Optional creator ID
    address creatorRegistry        // NEW: Registry contract address
) public returns (uint256) {
    // ... existing validation ...
    
    // Validate creator ID if provided
    if (bytes(creatorId).length > 0 && creatorRegistry != address(0)) {
        CreatorRegistry registry = CreatorRegistry(creatorRegistry);
        address registeredAddress = registry.getCreatorById(creatorId);
        require(registeredAddress == msg.sender, "Creator ID does not match sender");
    }
    
    // Store with creator ID
    zipFileInfo[tokenId] = ZipFileInfo({
        // ... existing fields ...
        creator: msg.sender,
        creatorId: creatorId,
        creatorRegistry: creatorRegistry
    });
}
```

### 2.3 Creator Identity Standards

**Supported Identity Formats:**

1. **Decentralized Identifiers (DIDs)**
   - Format: `did:method:identifier`
   - Example: `did:ens:creator.eth`
   - Standard: W3C DID Specification

2. **ENS Names**
   - Format: `name.eth`
   - Example: `alice.eth`
   - Resolves to Ethereum address

3. **Custom Identifiers**
   - Format: User-defined string
   - Example: `company-12345`
   - Must be unique within registry

**Metadata URI Structure:**
```json
{
  "name": "Creator Name",
  "description": "Creator description",
  "image": "ipfs://...",
  "website": "https://...",
  "verification": {
    "status": "verified",
    "method": "KYC",
    "timestamp": 1234567890
  },
  "reputation": {
    "score": 95,
    "totalTokens": 150,
    "verifiedTokens": 142
  }
}
```

### 2.4 Use Cases

**Use Case 1: Creator Registration**
```
1. Creator calls registerCreator("did:ens:alice.eth", metadataURI)
2. Registry stores mapping: address → creatorId
3. Creator can now mint tokens with their ID
```

**Use Case 2: Identity Verification**
```
1. Creator registers identity
2. Registry owner calls verifyCreator(creatorAddress)
3. Creator's isVerified flag set to true
4. Verified status visible in metadata
```

**Use Case 3: Address Migration**
```
1. Creator wants to change wallet address
2. Creator calls updateCreatorAddress(newAddress)
3. Identity preserved, address updated
4. All future tokens use new address
```

**Use Case 4: Reputation System**
```
1. Query all tokens by creatorId
2. Calculate reputation metrics:
   - Total tokens minted
   - Verified tokens count
   - Average token quality score
3. Display reputation in metadata
```

### 2.5 Implementation Details

**Registry Deployment:**
- Deploy `CreatorRegistry` contract first
- Set owner to governance address or multi-sig
- Registry address stored in main contract config

**Migration Strategy:**
- Existing v2.0/v3.0 tokens have empty `creatorId`
- Optional migration function to link existing tokens to creator IDs
- Migration requires creator to prove ownership

**Gas Optimization:**
- Use `string` for creatorId (flexible, but higher gas)
- Consider `bytes32` for fixed-length IDs (lower gas)
- Store metadata URI off-chain (IPFS/Arweave)

**Security Considerations:**
- Creator ID uniqueness enforced by registry
- Address updates require original address signature
- Verification requires owner/admin privileges
- Prevent ID squatting with registration fees

### 2.6 Integration Points

**SDK Integration:**
```typescript
interface CreatorIdentity {
  address: string;
  creatorId: string;
  metadataURI: string;
  isVerified: boolean;
  registrationTime: number;
}

class CreatorRegistry {
  async registerCreator(creatorId: string, metadataURI: string): Promise<void>
  async getCreator(address: string): Promise<CreatorIdentity>
  async getCreatorById(creatorId: string): Promise<string> // Returns address
  async verifyCreator(address: string): Promise<void> // Owner only
}
```

**Metadata Integration:**
- Creator ID included in token metadata
- Creator verification status visible
- Creator reputation metrics accessible
- Links to creator profile/metadata

---

## Phase 3: Smart Contract Control Mechanisms

### Status: 🔄 PLANNED (v3.2+)

### Overview

Phase 3 introduces a flexible controller system that allows smart contracts to control access, governance, licensing, and revenue sharing for tokenized ZIP files.

### 3.1 Controller Registry Contract

**New Contract: `ControllerRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Controller Registry
 * @dev Manages smart contract controllers for ZIP tokens
 */
contract ControllerRegistry {
    enum ControllerType {
        ACCESS_CONTROL,      // Controls who can access ZIP
        GOVERNANCE,          // Controls ZIP modifications
        LICENSING,           // Controls licensing terms
        REVENUE_SHARE,       // Controls revenue distribution
        CUSTOM               // Custom controller logic
    }
    
    struct Controller {
        address controllerAddress;
        ControllerType controllerType;
        bytes controllerConfig;    // Encoded configuration
        bool isActive;
        uint256 addedAt;
        address addedBy;
    }
    
    // Mapping from token ID to controllers
    mapping(uint256 => Controller[]) public tokenControllers;
    
    // Mapping from controller address to type
    mapping(address => ControllerType) public controllerTypes;
    
    // Events
    event ControllerAdded(
        uint256 indexed tokenId,
        address indexed controllerAddress,
        ControllerType controllerType,
        address indexed addedBy
    );
    
    event ControllerRemoved(
        uint256 indexed tokenId,
        address indexed controllerAddress,
        address indexed removedBy
    );
    
    event ControllerUpdated(
        uint256 indexed tokenId,
        address indexed controllerAddress,
        bytes newConfig
    );
    
    /**
     * @dev Add controller to token (token owner or approved only)
     */
    function addController(
        uint256 tokenId,
        address controllerAddress,
        ControllerType controllerType,
        bytes memory controllerConfig
    ) external {
        // Verify caller is token owner or approved
        // Implementation depends on main contract integration
        
        Controller memory newController = Controller({
            controllerAddress: controllerAddress,
            controllerType: controllerType,
            controllerConfig: controllerConfig,
            isActive: true,
            addedAt: block.timestamp,
            addedBy: msg.sender
        });
        
        tokenControllers[tokenId].push(newController);
        controllerTypes[controllerAddress] = controllerType;
        
        emit ControllerAdded(tokenId, controllerAddress, controllerType, msg.sender);
    }
    
    /**
     * @dev Remove controller from token
     */
    function removeController(uint256 tokenId, address controllerAddress) external {
        // Verify caller is token owner or approved
        Controller[] storage controllers = tokenControllers[tokenId];
        
        for (uint256 i = 0; i < controllers.length; i++) {
            if (controllers[i].controllerAddress == controllerAddress) {
                controllers[i].isActive = false;
                emit ControllerRemoved(tokenId, controllerAddress, msg.sender);
                break;
            }
        }
    }
    
    /**
     * @dev Get all active controllers for token
     */
    function getActiveControllers(uint256 tokenId) 
        external 
        view 
        returns (Controller[] memory) 
    {
        Controller[] storage allControllers = tokenControllers[tokenId];
        uint256 activeCount = 0;
        
        // Count active controllers
        for (uint256 i = 0; i < allControllers.length; i++) {
            if (allControllers[i].isActive) {
                activeCount++;
            }
        }
        
        // Build result array
        Controller[] memory activeControllers = new Controller[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allControllers.length; i++) {
            if (allControllers[i].isActive) {
                activeControllers[index] = allControllers[i];
                index++;
            }
        }
        
        return activeControllers;
    }
}
```

### 3.2 Controller Interface

**Base Controller Interface:**
```solidity
interface IZipController {
    /**
     * @dev Check if action is allowed
     * @param tokenId Token ID to check
     * @param action Action type (e.g., "READ", "EXTRACT", "MODIFY")
     * @param caller Address attempting action
     * @return allowed Whether action is allowed
     */
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view returns (bool allowed);
    
    /**
     * @dev Get controller configuration
     * @param tokenId Token ID
     * @return config Encoded configuration
     */
    function getConfig(uint256 tokenId) external view returns (bytes memory config);
    
    /**
     * @dev Update controller configuration (authorized only)
     * @param tokenId Token ID
     * @param newConfig New configuration
     */
    function updateConfig(uint256 tokenId, bytes memory newConfig) external;
}
```

### 3.3 Access Control Controllers

#### 3.3.1 TimeLockController

**Purpose:** Control time-based access to ZIP files

```solidity
contract TimeLockController is IZipController {
    struct TimeLock {
        uint256 unlockTime;
        bool isPermanent;  // If true, never unlocks
        address lockedBy;
    }
    
    mapping(uint256 => TimeLock) public tokenLocks;
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        TimeLock memory lock = tokenLocks[tokenId];
        
        // Permanent lock
        if (lock.isPermanent) {
            return false;
        }
        
        // Time-based lock
        return block.timestamp >= lock.unlockTime;
    }
    
    function lockToken(
        uint256 tokenId,
        uint256 unlockTime,
        bool isPermanent
    ) external {
        // Verify caller is token owner
        tokenLocks[tokenId] = TimeLock({
            unlockTime: unlockTime,
            isPermanent: isPermanent,
            lockedBy: msg.sender
        });
    }
}
```

**Use Cases:**
- Lock ZIP until specific date (e.g., product launch)
- Permanent lock for sensitive data
- Gradual unlock (unlock different files at different times)

#### 3.3.2 WhitelistController

**Purpose:** Control access via whitelist/blacklist

```solidity
contract WhitelistController is IZipController {
    struct AccessList {
        mapping(address => bool) whitelist;
        mapping(address => bool) blacklist;
        bool isWhitelistMode;  // true = whitelist, false = blacklist
    }
    
    mapping(uint256 => AccessList) public tokenAccessLists;
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        AccessList storage list = tokenAccessLists[tokenId];
        
        if (list.isWhitelistMode) {
            return list.whitelist[caller];
        } else {
            return !list.blacklist[caller];
        }
    }
    
    function addToWhitelist(uint256 tokenId, address account) external {
        // Verify caller is token owner
        tokenAccessLists[tokenId].whitelist[account] = true;
    }
    
    function addToBlacklist(uint256 tokenId, address account) external {
        // Verify caller is token owner
        tokenAccessLists[tokenId].blacklist[account] = true;
    }
}
```

**Use Cases:**
- Restrict access to specific addresses
- Block malicious addresses
- Create private ZIP collections

#### 3.3.3 PaymentController

**Purpose:** Require payment for access

```solidity
contract PaymentController is IZipController {
    struct PaymentRequirement {
        address paymentToken;  // address(0) for ETH
        uint256 amount;
        address recipient;
        mapping(address => bool) hasPaid;
    }
    
    mapping(uint256 => PaymentRequirement) public tokenPayments;
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        return tokenPayments[tokenId].hasPaid[caller];
    }
    
    function payForAccess(uint256 tokenId) external payable {
        PaymentRequirement storage payment = tokenPayments[tokenId];
        
        if (payment.paymentToken == address(0)) {
            // ETH payment
            require(msg.value >= payment.amount, "Insufficient payment");
            payable(payment.recipient).transfer(msg.value);
        } else {
            // ERC-20 payment
            IERC20 token = IERC20(payment.paymentToken);
            require(token.transferFrom(msg.sender, payment.recipient, payment.amount), "Payment failed");
        }
        
        payment.hasPaid[msg.sender] = true;
    }
}
```

**Use Cases:**
- Pay-per-access ZIP files
- Subscription-based access
- One-time purchase model

### 3.4 Governance Controllers

#### 3.4.1 MultiSigController

**Purpose:** Require multiple signatures for modifications

```solidity
contract MultiSigController is IZipController {
    struct Governance {
        address[] signers;
        uint256 requiredSignatures;
        mapping(bytes32 => mapping(address => bool)) approvals;
        mapping(bytes32 => bool) executed;
    }
    
    mapping(uint256 => Governance) public tokenGovernance;
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        // For modifications, require multi-sig
        if (keccak256(bytes(action)) == keccak256(bytes("MODIFY"))) {
            Governance storage gov = tokenGovernance[tokenId];
            // Check if caller is a signer
            for (uint256 i = 0; i < gov.signers.length; i++) {
                if (gov.signers[i] == caller) {
                    return true; // Signer can propose
                }
            }
            return false;
        }
        return true; // Read operations allowed
    }
    
    function proposeModification(
        uint256 tokenId,
        bytes memory proposalData
    ) external {
        Governance storage gov = tokenGovernance[tokenId];
        require(isSigner(tokenId, msg.sender), "Not a signer");
        
        bytes32 proposalHash = keccak256(abi.encodePacked(tokenId, proposalData));
        gov.approvals[proposalHash][msg.sender] = true;
        
        // Check if enough signatures
        uint256 approvalCount = 0;
        for (uint256 i = 0; i < gov.signers.length; i++) {
            if (gov.approvals[proposalHash][gov.signers[i]]) {
                approvalCount++;
            }
        }
        
        if (approvalCount >= gov.requiredSignatures && !gov.executed[proposalHash]) {
            gov.executed[proposalHash] = true;
            // Execute modification
        }
    }
}
```

**Use Cases:**
- Corporate governance for ZIP files
- Multi-party control
- Risk mitigation through consensus

#### 3.4.2 DAOController

**Purpose:** DAO-based governance

```solidity
contract DAOController is IZipController {
    // Integrates with existing DAO frameworks (e.g., Aragon, DAOstack)
    // Delegates governance decisions to DAO
    
    address public daoAddress;
    mapping(uint256 => uint256) public tokenProposals; // tokenId -> proposalId
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        // Check DAO voting status
        uint256 proposalId = tokenProposals[tokenId];
        // Query DAO for proposal status
        // Return true if proposal passed
        return true; // Simplified
    }
}
```

**Use Cases:**
- Community-governed ZIP files
- Decentralized decision-making
- Transparent governance processes

### 3.5 Licensing Controllers

#### 3.5.1 LicensingController

**Purpose:** Enforce licensing terms

```solidity
contract LicensingController is IZipController {
    enum LicenseType {
        PUBLIC_DOMAIN,
        MIT,
        APACHE_2_0,
        GPL_3_0,
        COMMERCIAL,
        CUSTOM
    }
    
    struct License {
        LicenseType licenseType;
        address licensor;
        uint256 royaltyBps;  // Basis points (e.g., 500 = 5%)
        string licenseText;  // IPFS hash or custom text
        bool requiresAttribution;
    }
    
    mapping(uint256 => License) public tokenLicenses;
    mapping(uint256 => mapping(address => bool)) public hasAcceptedLicense;
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        // Check if caller has accepted license
        return hasAcceptedLicense[tokenId][caller];
    }
    
    function acceptLicense(uint256 tokenId) external {
        hasAcceptedLicense[tokenId][msg.sender] = true;
        // Emit event for license acceptance
    }
    
    function getLicenseInfo(uint256 tokenId) external view returns (License memory) {
        return tokenLicenses[tokenId];
    }
}
```

**Use Cases:**
- Open source ZIP files with license requirements
- Commercial licensing with royalties
- Attribution requirements
- License compliance tracking

### 3.6 Revenue Share Controllers

#### 3.6.1 RevenueShareController

**Purpose:** Distribute revenue among multiple parties

```solidity
contract RevenueShareController is IZipController, ReentrancyGuard {
    struct RevenueShare {
        address[] recipients;
        uint256[] shares;  // Basis points per recipient
        uint256 totalShares; // Sum of all shares (should be 10000 = 100%)
    }
    
    mapping(uint256 => RevenueShare) public tokenRevenueShares;
    mapping(uint256 => uint256) public totalRevenue; // tokenId -> total ETH received
    
    function canPerform(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view override returns (bool) {
        // Access control not based on payment
        // Payment handled separately
        return true;
    }
    
    function distributeRevenue(uint256 tokenId) external payable nonReentrant {
        require(msg.value > 0, "No payment received");
        
        RevenueShare storage share = tokenRevenueShares[tokenId];
        require(share.recipients.length > 0, "No recipients configured");
        require(share.totalShares == 10000, "Invalid share distribution");
        
        totalRevenue[tokenId] += msg.value;
        
        // Distribute to each recipient
        for (uint256 i = 0; i < share.recipients.length; i++) {
            uint256 amount = (msg.value * share.shares[i]) / 10000;
            payable(share.recipients[i]).transfer(amount);
        }
    }
    
    function setRevenueShare(
        uint256 tokenId,
        address[] memory recipients,
        uint256[] memory shares
    ) external {
        // Verify caller is token owner
        require(recipients.length == shares.length, "Mismatched arrays");
        
        uint256 total = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            total += shares[i];
        }
        require(total == 10000, "Shares must total 10000");
        
        tokenRevenueShares[tokenId] = RevenueShare({
            recipients: recipients,
            shares: shares,
            totalShares: total
        });
    }
}
```

**Use Cases:**
- Split revenue among creators
- Automatic royalty distribution
- Escrow mechanisms
- Payment scheduling

### 3.7 Controller Integration

**Main Contract Integration:**
```solidity
contract ZipFileNFT is ERC721, ERC721URIStorage, Ownable {
    address public controllerRegistry;
    
    /**
     * @dev Check if action is allowed via controllers
     */
    function canPerformAction(
        uint256 tokenId,
        string memory action,
        address caller
    ) external view returns (bool) {
        if (controllerRegistry == address(0)) {
            return true; // No controllers, allow all
        }
        
        ControllerRegistry registry = ControllerRegistry(controllerRegistry);
        Controller[] memory controllers = registry.getActiveControllers(tokenId);
        
        // All active controllers must allow the action
        for (uint256 i = 0; i < controllers.length; i++) {
            IZipController controller = IZipController(controllers[i].controllerAddress);
            if (!controller.canPerform(tokenId, action, caller)) {
                return false;
            }
        }
        
        return true;
    }
}
```

**SDK Integration:**
```typescript
interface Controller {
  address: string;
  type: 'ACCESS_CONTROL' | 'GOVERNANCE' | 'LICENSING' | 'REVENUE_SHARE' | 'CUSTOM';
  config: string; // Encoded configuration
  isActive: boolean;
}

class ControllerRegistry {
  async addController(
    tokenId: string,
    controllerAddress: string,
    controllerType: string,
    config: any
  ): Promise<void>
  
  async getControllers(tokenId: string): Promise<Controller[]>
  
  async canPerformAction(
    tokenId: string,
    action: string,
    caller: string
  ): Promise<boolean>
}
```

### 3.8 Controller Development Guidelines

**Best Practices:**
1. **Security:**
   - Use `ReentrancyGuard` for payment operations
   - Validate all inputs
   - Check authorization before state changes
   - Use events for important actions

2. **Gas Optimization:**
   - Minimize storage operations
   - Use `view` functions where possible
   - Batch operations when feasible
   - Consider using libraries for common logic

3. **Upgradeability:**
   - Design controllers to be replaceable
   - Use interfaces for flexibility
   - Avoid hardcoded dependencies

4. **Testing:**
   - Unit tests for each controller
   - Integration tests with main contract
   - Gas usage benchmarks
   - Security audits

---

## Phase 4: Advanced Features

### Status: 🔄 PLANNED (v3.3+)

### 4.1 Token Relationships

#### Overview

Enable linking tokens together for parent-child relationships, version chains, and collections.

#### Implementation

```solidity
enum RelationshipType {
    PARENT,      // This token contains other tokenized ZIPs
    CHILD,       // This token is contained in another ZIP
    VERSION,     // This token is a version of another token
    COLLECTION,  // This token is part of a collection
    RELATED      // General relationship
}

struct TokenRelationship {
    uint256 relatedTokenId;
    RelationshipType relationshipType;
    string relationshipData;  // JSON metadata about relationship
    uint256 createdAt;
}

mapping(uint256 => TokenRelationship[]) public tokenRelationships;
mapping(uint256 => uint256[]) public parentTokens;  // tokenId -> parent tokenIds
mapping(uint256 => uint256[]) public childTokens;   // tokenId -> child tokenIds

function addRelationship(
    uint256 tokenId,
    uint256 relatedTokenId,
    RelationshipType relationshipType,
    string memory relationshipData
) external {
    // Verify caller is owner of both tokens
    require(_ownerOf(tokenId) == msg.sender, "Not token owner");
    require(_ownerOf(relatedTokenId) != address(0), "Related token does not exist");
    
    // Prevent circular relationships
    require(!hasCircularRelationship(tokenId, relatedTokenId), "Circular relationship");
    
    TokenRelationship memory relationship = TokenRelationship({
        relatedTokenId: relatedTokenId,
        relationshipType: relationshipType,
        relationshipData: relationshipData,
        createdAt: block.timestamp
    });
    
    tokenRelationships[tokenId].push(relationship);
    
    // Update bidirectional mappings
    if (relationshipType == RelationshipType.PARENT) {
        childTokens[tokenId].push(relatedTokenId);
        parentTokens[relatedTokenId].push(tokenId);
    } else if (relationshipType == RelationshipType.CHILD) {
        parentTokens[tokenId].push(relatedTokenId);
        childTokens[relatedTokenId].push(tokenId);
    }
    
    emit RelationshipAdded(tokenId, relatedTokenId, relationshipType);
}
```

#### Use Cases

**Version Chains:**
```
ZIP v1 → ZIP v2 → ZIP v3
Each version links to previous, creating audit trail
```

**Nested ZIPs:**
```
Archive.zip (parent)
  ├── Documents.zip (child)
  ├── Images.zip (child)
  └── Code.zip (child)
```

**Collections:**
```
Collection Token (parent)
  ├── Item 1.zip (child)
  ├── Item 2.zip (child)
  └── Item 3.zip (child)
```

### 4.2 Access Logging

#### Overview

Log access events for audit trails, usage analytics, and compliance tracking.

#### Implementation

```solidity
enum AccessType {
    READ,        // ZIP file read/listed
    EXTRACT,     // File extracted
    VERIFY,      // Integrity verified
    MODIFY,      // ZIP modified
    TRANSFER     // Token transferred
}

struct AccessLog {
    uint256 tokenId;
    address accessor;
    AccessType accessType;
    uint256 timestamp;
    string metadata;  // Additional context (IPFS hash, user agent, etc.)
}

// Use events for historical data (cheaper than storage)
event ZipFileAccessed(
    uint256 indexed tokenId,
    address indexed accessor,
    AccessType indexed accessType,
    uint256 timestamp,
    string metadata
);

// Optional: Store recent logs in contract (last N accesses)
mapping(uint256 => AccessLog[]) public recentAccessLogs;
uint256 public constant MAX_RECENT_LOGS = 100;

function logAccess(
    uint256 tokenId,
    AccessType accessType,
    string memory metadata
) external {
    // Verify token exists
    require(_ownerOf(tokenId) != address(0), "Token does not exist");
    
    AccessLog memory log = AccessLog({
        tokenId: tokenId,
        accessor: msg.sender,
        accessType: accessType,
        timestamp: block.timestamp,
        metadata: metadata
    });
    
    // Add to recent logs
    AccessLog[] storage logs = recentAccessLogs[tokenId];
    logs.push(log);
    
    // Keep only recent N logs
    if (logs.length > MAX_RECENT_LOGS) {
        // Remove oldest (shift array)
        for (uint256 i = 0; i < logs.length - 1; i++) {
            logs[i] = logs[i + 1];
        }
        logs.pop();
    }
    
    emit ZipFileAccessed(tokenId, msg.sender, accessType, block.timestamp, metadata);
}
```

#### Use Cases

**Audit Trails:**
- Track who accessed sensitive ZIP files
- Compliance with data protection regulations
- Forensic analysis of data breaches

**Usage Analytics:**
- Understand ZIP file usage patterns
- Optimize content delivery
- Measure engagement metrics

**Compliance:**
- GDPR compliance (data access logs)
- HIPAA compliance (healthcare data)
- Financial regulations (transaction logs)

### 4.3 Upgradeable Contract Pattern

#### Overview

Use upgradeable proxy pattern (UUPS) for future feature additions, bug fixes, and gas optimizations.

#### Implementation Strategy

**Proxy Pattern Selection:**
- **UUPS (Universal Upgradeable Proxy Standard)**: Recommended
  - More gas efficient than Transparent Proxy
  - Upgrade logic in implementation contract
  - Better for future upgrades

**Storage Layout:**
```solidity
// Storage slots must remain consistent across upgrades
contract ZipFileNFTV3 is UUPSUpgradeable, ERC721, ERC721URIStorage, Ownable {
    // Storage slot 0
    uint256 private _tokenIdCounter;
    
    // Storage slot 1
    mapping(uint256 => ZipFileInfo) public zipFileInfo;
    
    // Storage slot 2
    mapping(bytes32 => uint256) public compositeKeyToTokenId;
    
    // Storage slot 3 (NEW in v3.1)
    address public creatorRegistry;
    
    // Storage slot 4 (NEW in v3.2)
    address public controllerRegistry;
    
    // ... additional storage slots for future versions
}
```

**Upgrade Authorization:**
```solidity
function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
    // Additional checks can be added here
    // E.g., require timelock, multi-sig, DAO vote
}
```

**Version Management:**
```solidity
mapping(uint256 => string) public tokenVersions;  // tokenId -> version
string public contractVersion;

function getVersion() public view returns (string memory) {
    return contractVersion;
}

function getTokenVersion(uint256 tokenId) external view returns (string memory) {
    return tokenVersions[tokenId];
}
```

#### Migration Functions

```solidity
/**
 * @dev Migrate v2.0 token to v3.0 (add encrypted hash)
 */
function migrateToV3(
    uint256 tokenId,
    string memory encryptedHash
) external onlyOwner {
    require(bytes(zipFileInfo[tokenId].encryptedHash).length == 0, "Already migrated");
    zipFileInfo[tokenId].encryptedHash = encryptedHash;
    tokenVersions[tokenId] = "3.0";
    emit TokenMigrated(tokenId, "2.0", "3.0");
}

/**
 * @dev Migrate v3.0 token to v3.1 (add creator ID)
 */
function migrateToV3_1(
    uint256 tokenId,
    string memory creatorId,
    address creatorRegistryAddress
) external onlyOwner {
    require(bytes(zipFileInfo[tokenId].creatorId).length == 0, "Already migrated");
    zipFileInfo[tokenId].creatorId = creatorId;
    zipFileInfo[tokenId].creatorRegistry = creatorRegistryAddress;
    tokenVersions[tokenId] = "3.1";
    emit TokenMigrated(tokenId, "3.0", "3.1");
}
```

### 4.4 Multi-Chain Support

#### Overview

Support cross-chain tokenization with unified identity and verification across chains.

#### Implementation

**Chain Registry:**
```solidity
struct ChainInfo {
    uint256 chainId;
    address contractAddress;
    bool isActive;
}

mapping(uint256 => ChainInfo) public supportedChains;
mapping(uint256 => mapping(uint256 => bool)) public crossChainTokens; // tokenId -> chainId -> exists

function registerChain(
    uint256 chainId,
    address contractAddress
) external onlyOwner {
    supportedChains[chainId] = ChainInfo({
        chainId: chainId,
        contractAddress: contractAddress,
        isActive: true
    });
}

function isTokenOnChain(
    uint256 tokenId,
    uint256 chainId
) external view returns (bool) {
    return crossChainTokens[tokenId][chainId];
}
```

**Cross-Chain Verification:**
```solidity
struct CrossChainProof {
    uint256 sourceChainId;
    uint256 sourceTokenId;
    bytes32 merkleRoot;
    bytes proof;  // Merkle proof or bridge proof
}

function verifyCrossChain(
    CrossChainProof memory proof
) external view returns (bool) {
    // Verify proof from source chain
    // Check if merkle root matches
    // Validate chain is supported
    return true; // Simplified
}
```

**Bridge Integration:**
- Integrate with existing bridge protocols (e.g., LayerZero, Wormhole)
- Support token transfers across chains
- Maintain unified creator identity
- Cross-chain controller support

---

## Implementation Strategy

### Development Phases

**Phase 1 (v3.0):** ✅ COMPLETE
- Encrypted hash support
- Dual hash verification
- Service token upgrade support
- Backward compatibility

**Phase 2 (v3.1+):** 🔄 NEXT
- Creator registry contract
- Creator ID integration
- Identity migration tools

**Phase 3 (v3.2+):** 🔄 PLANNED
- Controller registry
- Base controller interfaces
- Example controllers (TimeLock, MultiSig, Licensing, RevenueShare)

**Phase 4 (v3.3+):** 🔄 FUTURE
- Token relationships
- Access logging
- Upgradeable pattern
- Multi-chain support

### Deployment Strategy

**Testnet Deployment:**
1. Deploy to Base Sepolia testnet
2. Comprehensive testing
3. Security audit
4. Gas optimization

**Mainnet Deployment:**
1. Deploy to Base Mainnet
2. Verify contract on block explorer
3. Update contract addresses in SDK
4. Announce deployment

**Migration Path:**
1. Deploy new contract version
2. Provide migration tools
3. Optional: Automatic migration for existing tokens
4. Maintain v2.0 contract for backward compatibility

### Version Management

**Contract Versioning:**
- Semantic versioning: MAJOR.MINOR.PATCH
- Major: Breaking changes
- Minor: New features, backward compatible
- Patch: Bug fixes

**Token Versioning:**
- Each token stores its version
- Enables version-specific features
- Supports gradual migration

---

## Security Considerations

### Smart Contract Security

**Common Vulnerabilities:**
1. **Reentrancy Attacks**
   - Use `ReentrancyGuard` for state-changing functions
   - Checks-Effects-Interactions pattern
   - Limit external calls

2. **Integer Overflow/Underflow**
   - Use Solidity 0.8+ (automatic checks)
   - Validate all arithmetic operations

3. **Access Control**
   - Use OpenZeppelin's `Ownable` or `AccessControl`
   - Verify permissions before state changes
   - Implement role-based access control

4. **Input Validation**
   - Validate all user inputs
   - Check string lengths
   - Validate addresses
   - Prevent empty values where required

5. **Front-running**
   - Use commit-reveal schemes for sensitive operations
   - Consider using private mempools (Flashbots)

### Security Audit Checklist

- [ ] Professional security audit
- [ ] Automated vulnerability scanning (Slither, Mythril)
- [ ] Formal verification for critical functions
- [ ] Gas optimization review
- [ ] Access control review
- [ ] Reentrancy protection
- [ ] Input validation
- [ ] Event emission for all state changes
- [ ] Error handling and edge cases
- [ ] Upgrade mechanism security

### Best Practices

1. **Code Quality:**
   - Follow Solidity style guide
   - Comprehensive NatSpec documentation
   - Unit tests with >90% coverage
   - Integration tests

2. **Access Control:**
   - Principle of least privilege
   - Multi-sig for critical operations
   - Timelock for upgrades
   - Emergency pause mechanism

3. **Upgrade Safety:**
   - Maintain storage layout compatibility
   - Test upgrades on testnet first
   - Gradual rollout
   - Rollback plan

---

## Gas Optimization

### Storage Optimization

**Efficient Data Structures:**
```solidity
// Pack structs to minimize storage slots
struct ZipFileInfo {
    // Slot 0: Packed (32 bytes)
    address creator;           // 20 bytes
    uint96 creationTimestamp;  // 12 bytes (fits until year 2106)
    
    // Slot 1: Packed (32 bytes)
    uint128 tokenizationTime;  // 16 bytes
    uint128 blockNumber;       // 16 bytes
    
    // Remaining slots: Strings (variable length)
    string merkleRootHash;
    string encryptedHash;
    string ipfsHash;
}
```

**String Storage:**
- Use `bytes32` for fixed-length hashes when possible
- Store long strings off-chain (IPFS/Arweave)
- Use events for historical data

### Function Optimization

**Batch Operations:**
```solidity
function batchAddControllers(
    uint256 tokenId,
    address[] memory controllers,
    ControllerType[] memory types
) external {
    // Single transaction for multiple operations
    // Reduces gas per operation
}
```

**View Functions:**
- Use `view` and `pure` where possible
- Minimize storage reads
- Cache frequently accessed values

**Event Optimization:**
- Use indexed parameters (up to 3)
- Minimize non-indexed data
- Store detailed data off-chain

### Gas Cost Estimates

**Phase 1 (v3.0):**
- Mint with encrypted hash: ~150,000-200,000 gas
- Mint from service token: ~150,000-200,000 gas
- Verify encrypted hash: ~2,500-3,500 gas (view)
- Get service token info: ~2,000-3,000 gas (view)

**Phase 2 (v3.1+):**
- Register creator: ~100,000-150,000 gas
- Mint with creator ID: +5,000-10,000 gas

**Phase 3 (v3.2+):**
- Add controller: ~50,000-100,000 gas per controller
- Controller check: ~2,000-5,000 gas (view)

**Phase 4 (v3.3+):**
- Add relationship: ~30,000-50,000 gas
- Log access: ~20,000-30,000 gas

---

## Migration Strategy

### Backward Compatibility

**Design Principles:**
1. New fields are optional
2. Old functions remain functional
3. Events include new fields but don't break old parsers
4. SDK supports both versions

**Version Detection:**
```solidity
function getContractVersion() public pure returns (string memory) {
    return "3.0.0";
}

function supportsFeature(string memory feature) public pure returns (bool) {
    if (keccak256(bytes(feature)) == keccak256(bytes("encryptedHash"))) {
        return true; // v3.0+
    }
    if (keccak256(bytes(feature)) == keccak256(bytes("creatorId"))) {
        return true; // v3.1+
    }
    // ... additional features
    return false;
}
```

### Migration Tools

**SDK Migration Helper:**
```typescript
class TokenMigrator {
  async checkMigrationStatus(tokenId: string): Promise<{
    currentVersion: string;
    latestVersion: string;
    canMigrate: boolean;
    migrationSteps: string[];
  }>
  
  async migrateToV3(tokenId: string, encryptedHash: string): Promise<void>
  async migrateToV3_1(tokenId: string, creatorId: string): Promise<void>
}
```

**Migration Scripts:**
- Batch migration for multiple tokens
- Progress tracking
- Error handling and retry logic
- Gas optimization

---

## Testing Strategy

### Unit Tests

**Test Coverage:**
- All public functions
- Edge cases and error conditions
- Access control
- Gas optimization verification

**Testing Framework:**
- Hardhat + Chai
- Coverage: >90%
- Gas snapshots

### Integration Tests

**Test Scenarios:**
1. End-to-end minting flow
2. Verification workflows
3. Controller interactions
4. Cross-contract calls
5. Event emission

### Security Tests

**Vulnerability Testing:**
- Reentrancy attacks
- Access control bypass
- Integer overflow/underflow
- Front-running scenarios
- Denial of service

### Gas Tests

**Benchmarking:**
- Gas costs for all operations
- Comparison with previous versions
- Optimization verification

---

**Note:** Service Token Upgrade functionality is now part of Phase 1 (v3.0). See Section 1.3 for detailed implementation.

## Future Considerations

### Privacy Enhancements

**Zero-Knowledge Proofs:**
- ZK proofs for encrypted ZIP verification
- Private merkle root verification
- Selective disclosure

**Implementation:**
- Integrate with ZK-SNARK libraries (e.g., Circom, SnarkJS)
- Generate proofs off-chain
- Verify on-chain

### Scalability Solutions

**Layer 2 Integration:**
- Deploy on Optimism, Arbitrum, Polygon
- Lower gas costs
- Faster transactions
- Cross-L2 bridges

**State Channels:**
- Off-chain transactions
- On-chain settlement
- Reduced gas costs

### Interoperability

**Standards Compliance:**
- ERC-721 extensions
- ERC-1155 support (multi-token)
- EIP-2981 (Royalty Standard)
- EIP-4906 (Metadata Update Standard)

**Cross-Chain Protocols:**
- LayerZero integration
- Wormhole integration
- IBC (Inter-Blockchain Communication)

### Composability

**DeFi Integration:**
- Collateralization of ZIP tokens
- Lending/borrowing against tokens
- Tokenized ZIP marketplaces

**NFT Marketplaces:**
- OpenSea integration
- LooksRare integration
- Custom marketplace support

### Governance

**DAO Implementation:**
- Protocol governance token
- Voting on upgrades
- Treasury management
- Fee distribution

---

## Appendix

### A. Contract Addresses

**v2.0 Contracts:**
- Base Sepolia: `0xdAe9D83d7AC62197fAE7704abc66b13DA28D3143`
- Base Mainnet: `0xd871Fba59F85108aF29299786DD8243B38dD9686`

**v3.0 Contracts:**
- Base Sepolia: TBD
- Base Mainnet: TBD

### B. Reference Implementations

**Example Controllers:**
- `TimeLockController.sol`
- `WhitelistController.sol`
- `PaymentController.sol`
- `MultiSigController.sol`
- `LicensingController.sol`
- `RevenueShareController.sol`

### C. SDK Documentation

**TypeScript SDK:**
- `ZipkitMinter` - Token minting
- `ZipkitVerifier` - Token verification
- `CreatorRegistry` - Creator management
- `ControllerRegistry` - Controller management

### D. Security Audit Reports

- Phase 1 Audit: TBD
- Phase 2 Audit: TBD
- Phase 3 Audit: TBD

---

## Document Maintenance

**Update Schedule:**
- Major updates: After each phase completion
- Minor updates: As implementation details change
- Version history: Tracked in git

**Contributors:**
- Development Team
- Security Auditors
- Community Feedback

**Review Process:**
- Technical review before implementation
- Security review before deployment
- Community feedback integration

---

**End of Document**

