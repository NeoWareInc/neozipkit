/**
 * Browser-compatible crypto shim
 * Provides Node.js crypto API using Web Crypto API + pure JS (SHA-1, PBKDF2, HMAC, AES-256-ECB).
 * Enables WinZip AES-256 encryption/decryption in the browser bundle. No extra dependencies.
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

// --- AES-256 support (WinZip AE-1/AE-2) via pure JS in browser (no deps) ---

// Minimal SHA-1 (returns 20-byte hash), standard FIPS-180-4
function sha1Raw(data) {
  const buf = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data);
  const len = buf.length;
  const bitLen = len * 8;
  const padLen = 64 - ((len + 9) % 64);
  const totalLen = len + 1 + (padLen < 0 ? padLen + 64 : padLen) + 8;
  const padded = Buffer.alloc(totalLen);
  buf.copy(padded, 0);
  padded[len] = 0x80;
  padded.writeUInt32BE((bitLen / 0x100000000) >>> 0, totalLen - 8);
  padded.writeUInt32BE(bitLen >>> 0, totalLen - 4);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const k = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  const w = new Array(80);

  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = padded.readUInt32BE(off + i * 4);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) << 1) | ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 31);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      let f, t;
      if (i < 20) {
        f = (b & c) | ((~b) & d);
        t = k[0];
      } else if (i < 40) {
        f = b ^ c ^ d;
        t = k[1];
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        t = k[2];
      } else {
        f = b ^ c ^ d;
        t = k[3];
      }
      t = (((a << 5) | (a >>> 27)) + f + e + t + (w[i] >>> 0)) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
  }

  const out = Buffer.alloc(20);
  for (let i = 0; i < 5; i++) {
    out.writeUInt32BE(h[i], i * 4);
  }
  return out;
}

function hmacSha1(key, data) {
  const blockLen = 64;
  let K = Buffer.isBuffer(key) ? Buffer.from(key) : Buffer.from(key);
  if (K.length > blockLen) {
    K = sha1Raw(K);
  }
  if (K.length < blockLen) {
    K = Buffer.concat([K, Buffer.alloc(blockLen - K.length)]);
  }
  const ipad = Buffer.alloc(blockLen, 0x36);
  const opad = Buffer.alloc(blockLen, 0x5c);
  for (let i = 0; i < blockLen; i++) {
    ipad[i] ^= K[i];
    opad[i] ^= K[i];
  }
  const inner = sha1Raw(Buffer.concat([ipad, Buffer.isBuffer(data) ? data : Buffer.from(data)]));
  return sha1Raw(Buffer.concat([opad, inner]));
}

function pbkdf2Sync(key, salt, iterations, keylen, digest) {
  if (digest && digest.toLowerCase() !== 'sha1') {
    throw new Error('Browser shim only supports PBKDF2 with sha1');
  }
  const hlen = 20;
  const blocks = Math.ceil(keylen / hlen);
  const result = [];
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
  for (let i = 1; i <= blocks; i++) {
    const iBuf = Buffer.from([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
    let u = hmacSha1(keyBuf, Buffer.concat([saltBuf, iBuf]));
    const block = Buffer.from(u);
    for (let j = 1; j < iterations; j++) {
      u = hmacSha1(keyBuf, u);
      for (let k = 0; k < hlen; k++) block[k] ^= u[k];
    }
    result.push(block);
  }
  return Buffer.concat(result).subarray(0, keylen);
}

function createHmac(algorithm, key) {
  if (algorithm !== 'sha1') {
    throw new Error('Browser shim createHmac only supports sha1');
  }
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  let data = Buffer.alloc(0);
  return {
    update(chunk) {
      data = Buffer.concat([data, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      return this;
    },
    digest() {
      const out = hmacSha1(keyBuf, data);
      data = Buffer.alloc(0);
      return out;
    },
  };
}

// Minimal AES-256-ECB (encrypt one 16-byte block). FIPS-197.
const AES_SBOX = new Uint8Array([0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16]);
const AES_RCON = new Uint8Array([0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36]);
function aes256KeyExpansion(key) {
  const w = new Uint8Array(240);
  for (let i = 0; i < 32; i++) w[i] = key[i];
  for (let i = 8; i < 60; i++) {
    const t = i * 4;
    const prev = (i - 8) * 4;
    const p = (i - 1) * 4;
    if (i % 8 === 0) {
      const t0 = AES_SBOX[w[p + 1]] ^ AES_RCON[(i / 8) - 1];
      w[t] = w[prev] ^ t0; w[t+1] = w[prev+1] ^ AES_SBOX[w[p+2]]; w[t+2] = w[prev+2] ^ AES_SBOX[w[p+3]]; w[t+3] = w[prev+3] ^ AES_SBOX[w[p]];
    } else if (i % 8 === 4) {
      w[t] = w[prev] ^ AES_SBOX[w[p]]; w[t+1] = w[prev+1] ^ AES_SBOX[w[p+1]]; w[t+2] = w[prev+2] ^ AES_SBOX[w[p+2]]; w[t+3] = w[prev+3] ^ AES_SBOX[w[p+3]];
    } else {
      w[t] = w[prev] ^ w[p]; w[t+1] = w[prev+1] ^ w[p+1]; w[t+2] = w[prev+2] ^ w[p+2]; w[t+3] = w[prev+3] ^ w[p+3];
    }
  }
  return w;
}
function xtime(x) {
  return (((x << 1) & 0xff) ^ (((x >>> 7) & 1) * 0x1b));
}
function aes256EcbEncryptBlock(keySchedule, block) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = block[i] ^ keySchedule[i];
  for (let r = 1; r < 14; r++) {
    for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    const t = s[1]; s[1]=s[5]; s[5]=s[9]; s[9]=s[13]; s[13]=t;
    const t2=s[2]; s[2]=s[10]; s[10]=t2; const t3=s[6]; s[6]=s[14]; s[14]=t3;
    const t4=s[3]; s[3]=s[15]; s[15]=s[11]; s[11]=s[7]; s[7]=t4;
    for (let c = 0; c < 4; c++) {
      const a = s[c*4]; const b = s[c*4+1]; const c2 = s[c*4+2]; const d = s[c*4+3];
      s[c*4]   = xtime(a) ^ xtime(b) ^ b ^ c2 ^ d;
      s[c*4+1] = a ^ xtime(b) ^ xtime(c2) ^ c2 ^ d;
      s[c*4+2] = a ^ b ^ xtime(c2) ^ xtime(d) ^ d;
      s[c*4+3] = xtime(a) ^ a ^ b ^ c2 ^ xtime(d);
    }
    const ro = r * 16;
    for (let i = 0; i < 16; i++) s[i] ^= keySchedule[ro + i];
  }
  for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
  const t = s[1]; s[1]=s[5]; s[5]=s[9]; s[9]=s[13]; s[13]=t;
  const t2=s[2]; s[2]=s[10]; s[10]=t2; const t3=s[6]; s[6]=s[14]; s[14]=t3;
  const t4=s[3]; s[3]=s[15]; s[15]=s[11]; s[11]=s[7]; s[7]=t4;
  for (let i = 0; i < 16; i++) s[i] ^= keySchedule[224 + i];
  return s;
}

function createCipheriv(algorithm, key, iv) {
  if (algorithm !== 'aes-256-ecb' || (iv !== null && iv !== undefined)) {
    throw new Error('Browser shim createCipheriv only supports aes-256-ecb with null iv');
  }
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  if (keyBuf.length !== 32) throw new Error('aes-256-ecb requires 32-byte key');
  const keySchedule = aes256KeyExpansion(keyBuf);
  return {
    setAutoPadding() {
      return this;
    },
    update(block) {
      const b = Buffer.isBuffer(block) ? block : Buffer.from(block);
      if (b.length !== 16) {
        throw new Error('Browser shim AES-ECB only supports 16-byte blocks');
      }
      const out = aes256EcbEncryptBlock(keySchedule, b);
      return Buffer.from(out);
    },
    final() {
      return Buffer.alloc(0);
    },
  };
}

// Export crypto-like object (ES module format)
export {
  createHash,
  randomBytes,
  pbkdf2Sync,
  createHmac,
  createCipheriv,
};

// Also export as default for compatibility
export default {
  createHash,
  randomBytes,
  pbkdf2Sync,
  createHmac,
  createCipheriv,
};
