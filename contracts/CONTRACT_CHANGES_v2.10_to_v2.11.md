# Contract Changes: v2.10 → v2.11

## Summary
**ONLY ONE CHANGE**: Added `encryptedHash` field to support encrypted ZIP file verification.

---

## 1. Struct Changes: `ZipFileInfo`

### v2.10:
```solidity
struct ZipFileInfo {
    string merkleRootHash;
    string ipfsHash;
    address creator;
    uint256 creationTimestamp;
    uint256 tokenizationTime;
    uint256 blockNumber;
}
```

### v2.11:
```solidity
struct ZipFileInfo {
    string merkleRootHash;
    string encryptedHash;      // ← NEW FIELD
    string ipfsHash;
    address creator;
    uint256 creationTimestamp;
    uint256 tokenizationTime;
    uint256 blockNumber;
}
```

**Change**: Added `string encryptedHash;` field to store SHA-256 hash of encrypted ZIP file content.

---

## 2. Function Signature Changes: `publicMintZipFile`

### v2.10:
```solidity
function publicMintZipFile(
    string memory merkleRootHash,
    uint256 creationTimestamp,
    string memory ipfsHash,
    string memory metadataURI
) public returns (uint256)
```

### v2.11:
```solidity
function publicMintZipFile(
    string memory merkleRootHash,
    string memory encryptedHash,    // ← NEW PARAMETER (2nd position)
    uint256 creationTimestamp,
    string memory ipfsHash,
    string memory metadataURI
) public returns (uint256)
```

**Change**: Added `string memory encryptedHash` as the **2nd parameter** (after `merkleRootHash`, before `creationTimestamp`).

**Important**: The parameter order is:
1. `merkleRootHash`
2. `encryptedHash` ← NEW
3. `creationTimestamp`
4. `ipfsHash`
5. `metadataURI`

---

## 3. Event Changes: `ZipFileTokenized`

### v2.10:
```solidity
event ZipFileTokenized(
    uint256 indexed tokenId,
    address indexed creator,
    string merkleRootHash,
    uint256 creationTimestamp,
    string ipfsHash,
    uint256 tokenizationTime,
    uint256 blockNumber
);
```

### v2.11:
```solidity
event ZipFileTokenized(
    uint256 indexed tokenId,
    address indexed creator,
    string merkleRootHash,
    string encryptedHash,      // ← NEW FIELD
    uint256 creationTimestamp,
    string ipfsHash,
    uint256 tokenizationTime,
    uint256 blockNumber
);
```

**Change**: Added `string encryptedHash` field to the event.

---

## 4. New Functions in v2.11

### `getEncryptedHash(uint256 tokenId)`
```solidity
function getEncryptedHash(uint256 tokenId) external view returns (string memory)
```
Returns the encrypted hash for a given token ID.

### `verifyEncryptedZipFile(uint256 tokenId, string memory providedEncryptedHash)`
```solidity
function verifyEncryptedZipFile(
    uint256 tokenId,
    string memory providedEncryptedHash
) external view returns (bool isValid)
```
Verifies that a provided encrypted hash matches the token's stored encrypted hash.

---

## 5. What Did NOT Change

- ✅ Contract name: Still `ZipFileNFTPublic`
- ✅ Token standard: Still ERC-721
- ✅ All other functions remain the same
- ✅ All other structs remain the same
- ✅ No `fileName` parameter (removed in v2.10, still not present in v2.11)

---

## Migration Notes

### For SDK/Code Calling the Contract:

**OLD (v2.10):**
```typescript
contract.publicMintZipFile(
  merkleRoot,
  creationTimestamp,
  ipfsHash,
  metadataURI
)
```

**NEW (v2.11):**
```typescript
contract.publicMintZipFile(
  merkleRoot,
  encryptedHash || '',  // ← Must add this parameter (empty string if not encrypted)
  creationTimestamp,
  ipfsHash,
  metadataURI
)
```

### Backward Compatibility:
- v2.11 contract **cannot** be called with v2.10 signature (will fail)
- v2.10 contract **cannot** be called with v2.11 signature (will fail)
- If you need to support both, use try/catch to attempt v2.11 first, then fall back to v2.10

---

## Version History

- **v2.0**: Had `fileName` as first parameter
- **v2.10**: Removed `fileName` parameter (privacy)
- **v2.11**: Added `encryptedHash` parameter (encryption support)

