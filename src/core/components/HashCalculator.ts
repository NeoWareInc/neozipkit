// ======================================
//  HashCalculator.ts - Unified Hash Component
//  Combines StreamHashCalculator, HashAccumulator, and MerkleTree functionality
// ======================================

import * as crypto from 'crypto';
import { crc32update } from '../encryption/ZipCrypto';

/**
 * Configuration options for Merkle tree construction
 */
interface MerkleTreeOptions {
  hashLeaves: boolean;      // Whether to hash the leaf nodes before adding to tree
  sortLeaves: boolean;      // Whether to sort leaf nodes for consistent trees
  sortPairs: boolean;       // Whether to sort each pair before hashing
  duplicateOdd: boolean;    // Whether to duplicate last leaf when odd number of leaves
}

/**
 * Unified hash calculator supporting:
 * - Incremental CRC-32 and SHA-256 calculation from raw data chunks
 * - Accumulation of pre-computed SHA-256 hashes with XOR and Merkle tree operations
 * - Merkle tree construction, proof generation, and verification
 * 
 * Usage examples:
 * 
 * Incremental hash calculation:
 * ```typescript
 * const calculator = new HashCalculator({ useSHA256: true });
 * calculator.update(dataChunk);
 * const crc32 = calculator.finalizeCRC32();
 * const sha256 = calculator.finalizeSHA256();
 * ```
 * 
 * Hash accumulation:
 * ```typescript
 * const calculator = new HashCalculator({ enableAccumulation: true });
 * calculator.addHash(sha256Hash1);
 * calculator.addHash(sha256Hash2);
 * const xor = calculator.xorHash();
 * const merkle = calculator.merkleRoot();
 * ```
 */
export class HashCalculator {
  // Incremental hash calculation state (from StreamHashCalculator)
  private crc32State: number = ~0;
  private sha256Hash: crypto.Hash | null = null;
  private useSHA256: boolean = false;

  // Hash accumulation state (from HashAccumulator)
  private hashes: Buffer[] = [];
  private xorResult: Buffer = Buffer.alloc(32, 0);
  private enableAccumulation: boolean = false;

  // Merkle tree state (from MerkleTree)
  private merkleLeaves: Buffer[] = [];
  private merkleLayers: Buffer[][] = [];
  private merkleOptions: MerkleTreeOptions = {
    hashLeaves: false,
    sortLeaves: true,
    sortPairs: true,
    duplicateOdd: true
  };

  /**
   * Creates a new HashCalculator instance
   * @param options - Configuration options:
   *   - useSHA256: Enable SHA-256 calculation for incremental mode (default: false)
   *   - enableAccumulation: Enable hash accumulation mode (default: false)
   */
  constructor(options?: {
    useSHA256?: boolean;
    enableAccumulation?: boolean;
  }) {
    this.useSHA256 = options?.useSHA256 || false;
    this.enableAccumulation = options?.enableAccumulation || false;

    if (this.useSHA256) {
      this.sha256Hash = crypto.createHash('sha256');
    }
  }

  // ============================================================================
  // Incremental Hash Calculation Methods (from StreamHashCalculator)
  // ============================================================================

  /**
   * Update hash state with a new chunk of data
   * Updates both CRC-32 and SHA-256 (if enabled) incrementally
   * @param chunk - Data chunk to process
   */
  update(chunk: Buffer): void {
    // Update CRC-32 incrementally using existing crc32update function
    for (let i = 0; i < chunk.length; i++) {
      this.crc32State = crc32update(this.crc32State, chunk[i]);
    }
    
    // Update SHA-256 incrementally
    if (this.sha256Hash) {
      this.sha256Hash.update(chunk);
    }
  }

  /**
   * Get final CRC-32 value
   * @returns Final CRC-32 value as unsigned 32-bit integer
   */
  finalizeCRC32(): number {
    return ~this.crc32State >>> 0; // Finalize with ~0 like the existing crc32 function
  }

  /**
   * Get final SHA-256 hash as hex string
   * @returns SHA-256 hash as hex string, or null if SHA-256 not enabled
   */
  finalizeSHA256(): string | null {
    if (this.sha256Hash) {
      return this.sha256Hash.digest('hex');
    }
    return null;
  }

  /**
   * Reset the incremental hash calculation state
   */
  reset(): void {
    this.crc32State = ~0;
    if (this.sha256Hash) {
      this.sha256Hash = crypto.createHash('sha256');
    }
  }

  // ============================================================================
  // Hash Accumulation Methods (from HashAccumulator)
  // ============================================================================

  /**
   * Adds a pre-computed SHA-256 hash to both the XOR accumulation and hash array
   * @param hash - Hash value as hex string or Buffer (must be 32 bytes for SHA-256)
   */
  addHash(hash: string | Buffer): void {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }

    // Convert hash to Buffer if it's a string
    const hashBuffer = typeof hash === 'string' 
      ? Buffer.from(hash, 'hex') 
      : hash;

    // Add to array for Merkle tree
    this.hashes.push(hashBuffer);
    this.merkleLeaves.push(hashBuffer);

    // XOR accumulation
    for (let i = 0; i < 32; i++) {
      this.xorResult[i] ^= hashBuffer[i];
    }

    // Rebuild Merkle tree when hash is added
    this.rebuildMerkleTree();
  }

  /**
   * Gets the accumulated XOR of all added hashes
   * @returns Hex string of XOR result
   */
  xorHash(): string {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }
    return this.xorResult.toString('hex');
  }

  /**
   * Creates a Merkle tree from accumulated hashes and returns the root
   * @returns Hex string of Merkle root, or null if no hashes added
   */
  merkleRoot(): string | null {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }

    if (this.merkleLeaves.length === 0) {
      return null;
    }

    // If Merkle tree not built yet, build it
    if (this.merkleLayers.length === 0) {
      this.rebuildMerkleTree();
    }

    const root = this.merkleLayers[this.merkleLayers.length - 1];
    if (root && root.length > 0) {
      return root[0].toString('hex');
    }

    return null;
  }

  /**
   * Gets the number of hashes accumulated
   * @returns Number of accumulated hashes
   */
  leafCount(): number {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }
    return this.hashes.length;
  }

  /**
   * Clears the accumulated hashes and resets XOR buffer
   */
  clear(): void {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }
    this.hashes = [];
    this.merkleLeaves = [];
    this.merkleLayers = [];
    this.xorResult = Buffer.alloc(32, 0);
  }

  /**
   * Combines multiple hash results into a single Merkle root
   * Static method for combining results from multiple HashCalculator instances
   * @param results - Array of objects containing merkleRoot properties
   * @returns Combined Merkle root as hex string, or null if no valid roots
   */
  static combineResults(results: { merkleRoot?: string }[]): string | null {
    const calculator = new HashCalculator({ enableAccumulation: true });
    
    // Combine all hashes
    for (const result of results) {
      if (result.merkleRoot) {
        calculator.addHash(result.merkleRoot);
      }
    }

    return calculator.merkleRoot();
  }

  // ============================================================================
  // Merkle Tree Methods (from MerkleTree)
  // ============================================================================

  /**
   * Computes SHA-256 hash of input data
   * @param data - Data to hash
   * @returns Buffer containing hash
   */
  private hash(data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  }

  /**
   * Combines two child hashes to create parent hash
   * @param left - Left child hash
   * @param right - Right child hash
   * @returns Combined hash of children
   */
  private combinedHash(left: Buffer, right: Buffer): Buffer {
    if (this.merkleOptions.sortPairs && Buffer.compare(left, right) > 0) {
      [left, right] = [right, left];
    }
    return this.hash(Buffer.concat([left, right]));
  }

  /**
   * Builds the Merkle tree by creating successive layers of hashes
   * @param nodes - Array of nodes in current layer
   */
  private createHashes(nodes: Buffer[]): void {
    while (nodes.length > 1) {
      const layerIndex = this.merkleLayers.length;
      this.merkleLayers.push([]);

      // Process pairs of nodes
      for (let i = 0; i < nodes.length - 1; i += 2) {
        const left = nodes[i];
        const right = nodes[i + 1];
        const hash = this.combinedHash(left, right);
        this.merkleLayers[layerIndex].push(hash);
      }

      // Handle odd number of nodes
      if (nodes.length % 2 === 1) {
        const last = nodes[nodes.length - 1];
        if (this.merkleOptions.duplicateOdd) {
          // Duplicate the last node if odd
          const hash = this.combinedHash(last, last);
          this.merkleLayers[layerIndex].push(hash);
        } else {
          // Push last node up to next layer
          this.merkleLayers[layerIndex].push(last);
        }
      }

      nodes = this.merkleLayers[layerIndex];
    }
  }

  /**
   * Rebuilds the Merkle tree from current leaves
   */
  private rebuildMerkleTree(): void {
    if (this.merkleLeaves.length === 0) {
      this.merkleLayers = [];
      return;
    }

    // Process leaves according to options
    const processedLeaves = this.merkleLeaves.map(leaf => {
      if (this.merkleOptions.hashLeaves) {
        return this.hash(leaf);
      }
      return Buffer.isBuffer(leaf) ? leaf : Buffer.from(leaf);
    });

    if (this.merkleOptions.sortLeaves) {
      processedLeaves.sort(Buffer.compare);
    }

    this.merkleLayers = [processedLeaves];
    this.createHashes(processedLeaves);
  }

  /**
   * Generates a proof of inclusion for a leaf node
   * @param leaf - The leaf node to generate proof for
   * @returns Array of sibling hashes needed to reconstruct root
   * @throws Error if leaf not found in tree or accumulation not enabled
   */
  getProof(leaf: Buffer): Buffer[] {
    if (!this.enableAccumulation) {
      throw new Error('Hash accumulation not enabled. Set enableAccumulation: true in constructor.');
    }

    if (this.merkleLayers.length === 0) {
      this.rebuildMerkleTree();
    }

    let index = this.merkleLeaves.findIndex(item => item.equals(leaf));
    if (index === -1) {
      throw new Error('Leaf not found in tree');
    }

    return this.merkleLayers.reduce((proof, layer) => {
      if (layer.length === 1) return proof;

      const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex]);
      }

      index = Math.floor(index / 2);
      return proof;
    }, [] as Buffer[]);
  }

  /**
   * Verifies a proof of inclusion for a leaf node
   * @param proof - Array of sibling hashes from getProof()
   * @param targetHash - Hash of the leaf node being verified
   * @param root - Expected root hash
   * @returns boolean indicating if proof is valid
   */
  verify(proof: Buffer[], targetHash: Buffer, root: Buffer): boolean {
    let computedHash = targetHash;

    for (const proofElement of proof) {
      computedHash = Buffer.compare(computedHash, proofElement) <= 0
        ? this.combinedHash(computedHash, proofElement)
        : this.combinedHash(proofElement, computedHash);
    }

    return computedHash.equals(root);
  }
}

// Default export
export default HashCalculator;

