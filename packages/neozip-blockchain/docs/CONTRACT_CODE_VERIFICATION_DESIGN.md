# Contract Code Verification Design

## Overview

Contract Code Verification ensures that the contract address being verified against actually contains the expected NZIP-NFT contract code. This prevents attackers from deploying malicious contracts and tricking the verification system into accepting fake tokens.

## Security Problem

### Current Protection: Address Validation

**Existing Protection**: The verification system already validates that the contract address in metadata matches the expected contract address for the network using `validateContractAddress()`. This prevents attackers from pointing metadata to malicious contracts at different addresses.

**Why Address Validation Works**:
- Contract addresses are deterministic (based on deployer address + nonce, or CREATE2)
- An attacker cannot deploy a malicious contract at the validated address
- If `contractAddress !== networkConfig.address`, verification fails immediately

### Remaining Vulnerabilities (Edge Cases)

While address validation prevents the primary attack vector, code verification adds protection against:

1. **Contract Upgradeability** (Proxy Pattern)
   - If the contract uses a proxy pattern, the implementation contract could be upgraded
   - The proxy address stays the same, but the implementation code changes
   - Code verification would detect if the implementation was changed to malicious code

2. **Configuration Errors**
   - If `ContractConfig` has the wrong address (human error, typo)
   - Code verification would detect that the code at that address doesn't match expected code
   - Provides defense-in-depth against configuration mistakes

3. **Self-Destruct and Redeploy** (Extremely Rare)
   - If a contract was self-destructed and the address was reused
   - New contract at same address would have different code
   - Code verification would detect this

4. **Defense in Depth**
   - Multiple layers of security are better than one
   - Code verification provides an additional check even if address validation passes

**Impact**: Medium - Address validation already prevents primary attack, but code verification adds protection against edge cases and configuration errors

## Solution: Contract Code Hash Verification (Defense in Depth)

### Approach

**Note**: This is a **defense-in-depth** measure. Address validation already prevents the primary attack (malicious contract at different address). Code verification adds protection against:
- Contract upgrades (proxy pattern)
- Configuration errors
- Self-destruct/redeploy scenarios

**Implementation**:
1. **Store Expected Code Hashes**: For each network, store the hash of the expected contract bytecode in `ContractConfig`
2. **Fetch On-Chain Code**: Query the contract bytecode from the blockchain using `provider.getCode(contractAddress)`
3. **Calculate Code Hash**: Compute a hash (SHA-256 or Keccak256) of the fetched bytecode
4. **Compare Hashes**: Compare the on-chain code hash with the expected hash
5. **Fail on Mismatch**: If hashes don't match, fail verification immediately

**When to Use**:
- **Recommended**: For upgradeable contracts (proxy pattern) where implementation can change
- **Optional**: For immutable contracts where address validation is sufficient
- **Always**: As a configuration error check (catches wrong addresses in config)

### Why Hash Instead of Full Bytecode?

- **Efficiency**: Hashes are small (32 bytes) vs. bytecode (can be 10KB+)
- **Privacy**: Don't need to store full bytecode in configuration
- **Security**: Hash comparison is cryptographically secure
- **Performance**: Faster comparison than bytecode comparison

## Implementation Details

### Phase 1: Add Code Hash to ContractConfig

**File**: `src/core/contracts.ts`

**Changes**:
```typescript
export interface ContractConfig {
  address: string
  network: string
  chainId: number
  explorerUrl: string
  rpcUrls: string[]
  version: string
  nameAliases?: string[]
  // NEW: Contract code hash for verification
  codeHash?: string  // SHA-256 or Keccak256 hash of contract bytecode
}
```

**Example Configuration**:
```typescript
export const CONTRACT_CONFIGS: Record<number, ContractConfig> = {
  84532: {
    address: '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e',
    network: 'Base Sepolia',
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org',
    rpcUrls: [...],
    version: '2.11',
    nameAliases: [...],
    codeHash: '0x1234567890abcdef...'  // SHA-256 hash of contract bytecode
  },
  // ... other networks
}
```

### Phase 2: Implement Code Verification Function

**File**: `src/core/contracts.ts`

**New Function**:
```typescript
import { ethers } from 'ethers';
import { createHash } from 'crypto';  // Node.js crypto for SHA-256

/**
 * Calculate SHA-256 hash of contract bytecode
 * @param bytecode Contract bytecode (hex string with or without 0x prefix)
 * @returns SHA-256 hash as hex string with 0x prefix
 */
export function calculateContractCodeHash(bytecode: string): string {
  // Remove 0x prefix if present
  const cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  
  // Convert to buffer and calculate SHA-256
  const buffer = Buffer.from(cleanBytecode, 'hex');
  const hash = createHash('sha256').update(buffer).digest('hex');
  
  return '0x' + hash;
}

/**
 * Verify contract code hash matches expected hash
 * @param contractAddress Contract address to verify
 * @param networkConfig Network configuration with expected code hash
 * @param provider Ethers provider for blockchain queries
 * @param debug Optional debug flag
 * @returns Verification result with success status and error message if failed
 */
export async function verifyContractCodeHash(
  contractAddress: string,
  networkConfig: ContractConfig,
  provider: ethers.Provider,
  debug: boolean = false
): Promise<{ success: boolean; error?: string; codeHash?: string }> {
  // Check if code hash is configured
  if (!networkConfig.codeHash) {
    if (debug) {
      console.log(`[DEBUG] ⚠️  Code hash not configured for network ${networkConfig.network}. Skipping code verification.`);
    }
    // If code hash not configured, allow verification (backward compatibility)
    // In production, this should be configured for all networks
    return { success: true };
  }

  try {
    // Fetch contract bytecode from blockchain
    const bytecode = await provider.getCode(contractAddress);
    
    if (!bytecode || bytecode === '0x') {
      return {
        success: false,
        error: `No contract code found at address ${contractAddress}. Contract may not be deployed or address is invalid.`
      };
    }

    // Calculate hash of fetched bytecode
    const calculatedHash = calculateContractCodeHash(bytecode);
    
    // Normalize both hashes (lowercase for comparison)
    const expectedHash = networkConfig.codeHash.toLowerCase();
    const actualHash = calculatedHash.toLowerCase();

    if (debug) {
      console.log(`[DEBUG] Contract code verification:`);
      console.log(`[DEBUG]   Expected hash: ${expectedHash}`);
      console.log(`[DEBUG]   Actual hash:   ${actualHash}`);
    }

    // Compare hashes
    if (actualHash !== expectedHash) {
      return {
        success: false,
        error: `Contract code hash mismatch. Expected: ${expectedHash}, Actual: ${actualHash}. This contract may be malicious or modified.`,
        codeHash: calculatedHash
      };
    }

    if (debug) {
      console.log(`[DEBUG] ✅ Contract code hash verified successfully`);
    }

    return {
      success: true,
      codeHash: calculatedHash
    };

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to verify contract code: ${errorMessage}`
    };
  }
}
```

### Phase 3: Integrate into ZipkitVerifier

**File**: `src/core/ZipkitVerifier.ts`

**Changes to `verifyOnChain()` method**:

```typescript
async verifyOnChain(
  tokenId: string, 
  contractAddress: string, 
  networkConfig: ContractConfig, 
  merkleRoot: string,
  rpcUrlIndex: number = 0,
  options: VerificationOptions = {},
  metadataContractVersion?: string
): Promise<{ 
  success: boolean; 
  isValid?: boolean; 
  onChainMerkleRoot?: string; 
  onChainTokenizationTime?: number;
  onChainCreator?: string;
  onChainBlockNumber?: number;
  error?: string; 
  rpcUrl?: string 
}> {
  
  // ... existing code ...

  // CRITICAL SECURITY CHECK: Verify contract code hash before any contract calls
  // This must be done FIRST to prevent verification against malicious contracts
  const rpcUrls = networkConfig.rpcUrls.length > 0 ? networkConfig.rpcUrls : [];
  if (rpcUrls.length === 0) {
    return { 
      success: false, 
      error: 'No RPC URLs configured for this network' 
    };
  }

  if (rpcUrlIndex >= rpcUrls.length) {
    return {
      success: false,
      error: `RPC URL index ${rpcUrlIndex} is out of range (${rpcUrls.length} RPCs available)`
    };
  }

  const rpcUrl = rpcUrls[rpcUrlIndex];
  let provider: ethers.JsonRpcProvider | null = null;
  
  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);

    // VERIFY CONTRACT CODE HASH FIRST (before any contract calls)
    const codeVerification = await verifyContractCodeHash(
      contractAddress,
      networkConfig,
      provider,
      this.debug
    );

    if (!codeVerification.success) {
      return {
        success: false,
        error: `Contract code verification failed: ${codeVerification.error}`,
        rpcUrl
      };
    }

    // ... rest of existing verification code ...
    
  } catch (error: any) {
    // ... error handling ...
  } finally {
    // ... cleanup ...
  }
}
```

**Changes to `queryMultipleRPCsWithConsensus()` method**:

```typescript
private async queryMultipleRPCsWithConsensus(
  tokenId: string,
  contractAddress: string,
  networkConfig: ContractConfig,
  merkleRoot: string,
  minConsensus: number = 2,
  metadataContractVersion?: string,
  options: VerificationOptions = {}
): Promise<{...}> {
  
  // ... existing code ...

  // VERIFY CONTRACT CODE HASH ON FIRST RPC (before consensus queries)
  // We only need to verify once since code should be same across all RPCs
  if (endpointsToQuery.length > 0) {
    const firstRpcUrl = endpointsToQuery[0];
    try {
      const provider = new ethers.JsonRpcProvider(firstRpcUrl);
      const codeVerification = await verifyContractCodeHash(
        contractAddress,
        networkConfig,
        provider,
        this.debug
      );
      
      if (!codeVerification.success) {
        return {
          success: false,
          error: `Contract code verification failed: ${codeVerification.error}`
        };
      }
      
      provider.destroy();
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to verify contract code: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // ... rest of consensus query code ...
}
```

### Phase 4: Add Code Hash Calculation Utility

**File**: `src/core/contracts.ts` or new utility file

**Script to Calculate Code Hashes**:

```typescript
/**
 * Utility function to calculate contract code hash from bytecode file
 * This can be used during deployment to generate code hashes
 * 
 * Usage:
 *   const bytecode = fs.readFileSync('Bytecode.txt', 'utf8').trim();
 *   const codeHash = calculateContractCodeHash(bytecode);
 *   console.log(`Code hash: ${codeHash}`);
 */
```

**Or create a script**: `scripts/calculate-code-hash.ts`

```typescript
#!/usr/bin/env node

import { readFileSync } from 'fs';
import { calculateContractCodeHash } from '../src/core/contracts';

const bytecodePath = process.argv[2] || 'contracts/Bytecode.txt';

try {
  const bytecode = readFileSync(bytecodePath, 'utf8').trim();
  const codeHash = calculateContractCodeHash(bytecode);
  console.log(`Contract Code Hash: ${codeHash}`);
  console.log(`\nAdd this to ContractConfig.codeHash:`);
  console.log(`  codeHash: '${codeHash}'`);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
```

### Phase 5: Update VerificationOptions

**File**: `src/core/ZipkitVerifier.ts`

**Add option to skip code verification** (for testing/backward compatibility):

```typescript
export interface VerificationOptions {
  debug?: boolean;
  skipHash?: boolean;
  rpcConsensus?: boolean;
  minRpcConsensus?: number;
  validateRpcChainId?: boolean;
  validateContractVersion?: boolean;
  /**
   * Skip contract code hash verification
   * WARNING: Only use for testing or backward compatibility
   * Default: false (code verification enabled for security)
   */
  skipCodeVerification?: boolean;
}
```

## How to Generate Code Hashes

### Method 1: From Deployed Contract

```typescript
import { ethers } from 'ethers';
import { calculateContractCodeHash } from './src/core/contracts';

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const contractAddress = '0xc88F1a9C32bC024Bd082BAe023E10a3BCC5c0e3e';

const bytecode = await provider.getCode(contractAddress);
const codeHash = calculateContractCodeHash(bytecode);
console.log(`Code hash: ${codeHash}`);
```

### Method 2: From Bytecode File

```bash
# Using the utility script
node scripts/calculate-code-hash.ts contracts/Bytecode.txt
```

### Method 3: From Compilation Output

```typescript
// After compiling contract
const compiledBytecode = fs.readFileSync('contracts/Bytecode-compiled.txt', 'utf8');
const codeHash = calculateContractCodeHash(compiledBytecode);
```

## Security Considerations

### 1. Code Hash Storage

- **Where**: Store in `ContractConfig` in `contracts.ts`
- **Format**: SHA-256 hash as hex string with `0x` prefix
- **Security**: Code hashes are public information (bytecode is public on blockchain)

### 2. Verification Timing

- **When**: Verify code hash BEFORE any contract calls
- **Why**: Prevents malicious contract from executing during verification
- **Order**: Code verification → Contract calls → Data validation

### 3. Backward Compatibility

- **Missing Code Hash**: If `codeHash` not configured, allow verification (with warning)
- **Migration**: Gradually add code hashes to all network configs
- **Option**: `skipCodeVerification` flag for testing/legacy support

### 4. Error Handling

- **No Code**: If `getCode()` returns `0x`, fail verification
- **Network Error**: If code fetch fails, fail verification (don't skip)
- **Hash Mismatch**: Fail immediately with clear error message

### 5. Performance

- **Single Check**: Only verify once per verification (not per RPC in consensus)
- **Caching**: Could cache code hashes per address (optional optimization)
- **Timeout**: Add timeout to `getCode()` call (default: 10 seconds)

## Testing Strategy

### Unit Tests

1. **Hash Calculation**: Test `calculateContractCodeHash()` with known bytecode
2. **Verification Success**: Test with matching hashes
3. **Verification Failure**: Test with mismatched hashes
4. **Missing Code**: Test with empty bytecode (`0x`)
5. **Missing Config**: Test with missing `codeHash` in config

### Integration Tests

1. **Real Contract**: Verify against actual deployed contract
2. **Wrong Contract**: Verify against different contract (should fail)
3. **Network Errors**: Test with invalid RPC or network issues
4. **Consensus Mode**: Test code verification in consensus mode

### Security Tests

1. **Malicious Contract**: Deploy fake contract, verify detection
2. **Code Modification**: Test detection of modified contract
3. **Address Spoofing**: Test with wrong contract address

## Benefits

1. **Defense in Depth**: Additional security layer beyond address validation
2. **Detects Contract Upgrades**: Catches if upgradeable contract implementation changed
3. **Configuration Error Detection**: Catches wrong addresses in config files
4. **Early Failure**: Fails fast before expensive contract calls
5. **Cryptographically Secure**: Hash comparison is secure
6. **Efficient**: Hash comparison is fast (32 bytes vs. 10KB+ bytecode)
7. **Configurable**: Can be disabled for testing if needed

## When Code Verification is Most Valuable

1. **Upgradeable Contracts**: If contracts use proxy pattern, code verification detects implementation changes
2. **Multi-Version Deployments**: If same address can have different code versions
3. **Configuration Validation**: Catches human errors in `ContractConfig` addresses
4. **High-Security Environments**: Where defense-in-depth is required

## Trade-offs

1. **Additional RPC Call**: One extra `getCode()` call per verification (small performance cost)
2. **Configuration Required**: Need to calculate and store code hashes for each network
3. **Maintenance**: Code hashes must be updated when contracts are upgraded
4. **Complexity**: Adds another verification step
5. **Redundancy**: For immutable contracts, address validation may be sufficient

## Recommendation

**For Immutable Contracts** (Current NZIP-NFT contracts):
- Address validation is **sufficient** for preventing malicious contract attacks
- Code verification is **optional** but provides defense-in-depth and configuration error detection
- Consider making it **optional** via `VerificationOptions.skipCodeVerification`

**For Upgradeable Contracts** (Future proxy implementations):
- Code verification is **highly recommended** to detect implementation changes
- Should be **enabled by default** for upgradeable contracts

## Future Enhancements

1. **Multi-Version Support**: Store code hashes for multiple contract versions
2. **Automatic Hash Calculation**: Auto-calculate from deployment
3. **Hash Caching**: Cache code hashes to reduce RPC calls
4. **Code Diff**: Show differences when hash mismatch (for debugging)
