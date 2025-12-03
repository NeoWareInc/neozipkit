/**
 * Browser-compatible crypto shim
 * Provides Node.js crypto API using Web Crypto API
 */

// Use Web Crypto API for browser
const webCrypto = typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' && window.crypto ? window.crypto : null);

if (!webCrypto || !webCrypto.subtle) {
  throw new Error('Web Crypto API is not available in this environment');
}

// Convert ArrayBuffer to Buffer-like Uint8Array
function arrayBufferToUint8Array(buffer) {
  return new Uint8Array(buffer);
}

// Convert Uint8Array/ArrayBuffer to Buffer
function toBuffer(data) {
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data);
}

// Create hash using Web Crypto API
async function createHash(algorithm) {
  const algoMap = {
    'sha256': 'SHA-256',
    'sha1': 'SHA-1',
    'md5': 'MD5',
  };

  const webAlgo = algoMap[algorithm.toLowerCase()] || 'SHA-256';

  return {
    update: function(data) {
      this._data = this._data ? Buffer.concat([this._data, toBuffer(data)]) : toBuffer(data);
      return this;
    },
    digest: async function(encoding) {
      const data = this._data || Buffer.alloc(0);
      const hashBuffer = await webCrypto.subtle.digest(webAlgo, data);
      const hashArray = arrayBufferToUint8Array(hashBuffer);
      
      if (encoding === 'hex') {
        return Array.from(hashArray)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
      if (encoding === 'base64') {
        return Buffer.from(hashArray).toString('base64');
      }
      return Buffer.from(hashArray);
    }
  };
}

// Generate random bytes using Web Crypto API
function randomBytes(size) {
  const array = new Uint8Array(size);
  webCrypto.getRandomValues(array);
  return Buffer.from(array);
}

// Export crypto-like object (ES module format)
export {
  createHash,
  randomBytes,
};

// Also export as default for compatibility
export default {
  createHash,
  randomBytes,
};

