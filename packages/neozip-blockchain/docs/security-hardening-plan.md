---
name: Security Hardening for Blockchain Verification
overview: This plan addresses critical security vulnerabilities in the blockchain token verification system, including contract address validation, RPC endpoint security, input validation, and merkle root verification improvements.
todos:
  - id: contract-address-validation
    content: Add contract address validation to verify metadata contract matches expected contract for network
    status: pending
  - id: rpc-consensus-mechanism
    content: Implement multi-RPC consensus mechanism requiring majority agreement for verification
    status: pending
  - id: contract-code-verification
    content: Add contract code hash verification to ensure contract matches expected implementation
    status: pending
  - id: input-validation
    content: Add comprehensive input validation for token ID, contract address, network name, and merkle root format
    status: pending
  - id: merkle-root-comparison
    content: Fix merkle root comparison to use case-sensitive comparison and validate format
    status: pending
  - id: version-validation
    content: Remove automatic version fallback and require explicit version validation
    status: pending
  - id: error-handling
    content: Improve error handling to fail fast on security errors and log all verification attempts
    status: pending
  - id: security-tests
    content: Create comprehensive security tests for all validation and verification logic
    status: pending
    dependencies:
      - contract-address-validation
      - rpc-consensus-mechanism
      - contract-code-verification
      - input-validation
---

# Security Hardening Plan for Blockchain Token Verification

## Executive Summary

This plan addresses critical security vulnerabilities identified in the blockchain token verification system. The verification process currently has several weaknesses that could allow attackers to bypass verification, use malicious RPC endpoints, or verify against incorrect contracts.

## Security Vulnerabilities Identified

### Critical Issues

1. **Contract Address Validation Missing**

- **Location**: `src/core/ZipkitVerifier.ts:verifyToken()` and `src/browser/TokenVerifierBrowser.ts:queryBlockchainData()`
- **Issue**: Contract address from metadata is used without validation against expected contract for the network
- **Risk**: Attacker could create fake metadata pointing to malicious contract
- **Impact**: High - Could verify against wrong contract or malicious contract

2. **RPC Endpoint Security**

- **Location**: `src/core/ZipkitVerifier.ts:verifyOnChain()` and `src/browser/TokenVerifierBrowser.ts:queryBlockchainData()`
- **Issue**: No validation of RPC responses, no consensus mechanism, vulnerable to malicious RPC endpoints
- **Risk**: Malicious RPC could return fake blockchain data
- **Impact**: Critical - Could bypass verification entirely

3. **Network Name Fuzzy Matching**

- **Location**: `src/core/ZipkitVerifier.ts:getNetworkConfig()`
- **Issue**: Fuzzy matching could match wrong network
- **Risk**: Verification against wrong network
- **Impact**: High - Could verify against wrong blockchain

4. **Merkle Root Comparison Weakness**

- **Location**: `src/core/ZipkitVerifier.ts:verifyOnChain()` line 682
- **Issue**: Case-insensitive comparison (`toLowerCase()`) could hide encoding issues
- **Risk**: Potential for case-based attacks or encoding confusion
- **Impact**: Medium - Could allow false positives

### High Priority Issues

5. **Input Validation Gaps**

- **Location**: `src/core/ZipkitVerifier.ts:extractTokenMetadata()` and `verifyToken()`
- **Issue**: Token ID format not validated, contract address format not validated, network name not sanitized
- **Risk**: Injection attacks, invalid data processing
- **Impact**: Medium - Could cause errors or unexpected behavior

6. **Version Fallback Masking Issues**

- **Location**: `src/core/ZipkitVerifier.ts:verifyOnChain()` lines 571-586
- **Issue**: Version fallback could mask security issues
- **Risk**: Wrong version used, security checks bypassed
- **Impact**: Medium - Could use wrong contract version

7. **No Contract Code Verification**

- **Location**: `src/core/ZipkitVerifier.ts:verifyOnChain()`
- **Issue**: Doesn't verify contract code matches expected contract
- **Risk**: Contract could be replaced or modified
- **Impact**: High - Could verify against malicious contract

8. **Metadata Network Inference**

- **Location**: `src/core/ZipkitVerifier.ts:extractTokenMetadata()` lines 144-150
- **Issue**: Network chainId inferred from network name if missing
- **Risk**: Could infer wrong chainId
- **Impact**: Medium - Could verify against wrong network

### Medium Priority Issues

9. **Error Handling Too Permissive**

- **Location**: Multiple locations in `ZipkitVerifier.ts`
- **Issue**: Some errors silently caught and continue
- **Risk**: Security issues could be hidden
- **Impact**: Medium - Could hide verification failures

10. **No Replay Protection**

 - **Location**: Verification process
 - **Issue**: No timestamp validation or replay protection
 - **Risk**: Replay attacks possible
 - **Impact**: Low - Limited attack surface

11. **No Rate Limiting**

 - **Location**: RPC calls
 - **Issue**: No rate limiting on RPC calls
 - **Risk**: DoS attacks possible
 - **Impact**: Low - Availability issue

## Implementation Plan

### Phase 1: Critical Security Fixes

#### 1.1 Contract Address Validation

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add `validateContractAddress()` method to verify contract address matches expected contract for network
- Use `getContractConfig()` to get expected contract address
- Compare metadata contract address with expected address
- Fail verification if addresses don't match
- Add validation in `verifyToken()` before blockchain queries

#### 1.2 RPC Endpoint Security

- **File**: `src/core/ZipkitVerifier.ts` and `src/browser/TokenVerifierBrowser.ts`
- **Changes**:
- Implement RPC response validation
- Add consensus mechanism: query multiple RPC endpoints and require majority agreement
- Add RPC endpoint whitelist/blacklist
- Validate chainId from RPC matches expected chainId
- Add timeout and retry logic with exponential backoff
- Log all RPC calls for audit trail

#### 1.3 Contract Code Verification

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add `verifyContractCode()` method
- Get contract code hash from blockchain
- Compare with expected contract code hash (stored in `contracts.ts`)
- Fail verification if code doesn't match
- Add to `verifyOnChain()` before any contract calls

### Phase 2: Input Validation and Sanitization

#### 2.1 Token ID Validation

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add `validateTokenId()` method
- Validate token ID is valid uint256 format
- Check token ID is within reasonable bounds
- Reject invalid token IDs

#### 2.2 Contract Address Format Validation

- **File**: `src/core/ZipkitVerifier.ts` and `src/browser/TokenVerifierBrowser.ts`
- **Changes**:
- Add `validateEthereumAddress()` method using ethers.js `isAddress()`
- Validate checksum format
- Reject invalid addresses

#### 2.3 Network Name Sanitization

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Remove fuzzy matching or make it strict
- Require exact network name match or chainId
- Add network name whitelist
- Reject unknown networks

#### 2.4 Merkle Root Format Validation

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add `validateMerkleRootFormat()` method
- Validate merkle root is valid hex string
- Validate length (should be 64 characters for SHA-256)
- Use case-sensitive comparison instead of case-insensitive
- Normalize format before comparison

### Phase 3: Enhanced Verification Logic

#### 3.1 Multi-RPC Consensus

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Implement `queryMultipleRPCs()` method
- Query at least 3 RPC endpoints
- Require majority agreement (2 of 3) for verification
- Log discrepancies
- Fail if no consensus

#### 3.2 Version Validation

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Remove automatic version fallback
- Require explicit version in metadata
- Validate version matches contract version from blockchain
- Fail if version mismatch

#### 3.3 Enhanced Error Handling

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Remove silent error catching
- Log all errors with context
- Fail fast on security-related errors
- Add error categorization (security vs. network vs. validation)

### Phase 4: Additional Security Enhancements

#### 4.1 Timestamp Validation

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Validate tokenization timestamp is reasonable (not in future, not too old)
- Add configurable time window for validation
- Log timestamp discrepancies

#### 4.2 Rate Limiting

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add rate limiting for RPC calls
- Implement exponential backoff
- Add request queuing

#### 4.3 Audit Logging

- **File**: `src/core/ZipkitVerifier.ts`
- **Changes**:
- Add comprehensive audit logging
- Log all verification attempts with full context
- Include RPC endpoints used, responses received, validation results
- Make logs searchable and structured

### Phase 5: Configuration and Testing

#### 5.1 Security Configuration

- **File**: `src/core/contracts.ts`
- **Changes**:
- Add contract code hashes to `ContractConfig`
- Add RPC endpoint validation rules
- Add security policy configuration

#### 5.2 Security Tests

- **File**: `tests/unit/verification-security.test.ts` (new)
- **Changes**:
- Add tests for contract address validation
- Add tests for RPC consensus mechanism
- Add tests for input validation
- Add tests for malicious RPC endpoints
- Add tests for contract code verification
- Add fuzzing tests for edge cases

## Implementation Details

### New Methods to Add

1. `validateContractAddress(contractAddress: string, networkChainId: number): boolean`
2. `verifyContractCode(contractAddress: string, networkConfig: ContractConfig): Promise<boolean>`
3. `validateTokenId(tokenId: string): boolean`
4. `validateEthereumAddress(address: string): boolean`
5. `validateMerkleRootFormat(merkleRoot: string): boolean`
6. `queryMultipleRPCs(...): Promise<ConsensusResult>`
7. `validateTimestamp(timestamp: number): boolean`

### Configuration Changes

- Add `contractCodeHash` to `ContractConfig` interface
- Add `rpcConsensusRequired` to `VerificationOptions`
- Add `minRpcConsensus` to `VerificationOptions`
- Add `maxTimestampAge` to `VerificationOptions`

### Breaking Changes

- Contract address validation will fail verification if address doesn't match expected contract
- Version fallback removed - requires explicit version
- Fuzzy network matching removed - requires exact match or chainId
- Case-sensitive merkle root comparison

## Testing Strategy

1. **Unit Tests**: Test each validation method independently
2. **Integration Tests**: Test full verification flow with mocked RPC endpoints
3. **Security Tests**: Test against malicious inputs and RPC endpoints
4. **Fuzzing**: Fuzz all input validation methods
5. **Penetration Testing**: Manual security review of verification flow

## Migration Notes

- Existing tokenized files may need metadata updates if version is missing
- Users may need to update their verification code to handle stricter validation
- RPC endpoint configuration may need updates for consensus mechanism