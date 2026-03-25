# WinZip AES Encryption in ZIP Files

This document describes how **WinZip-compatible AES** (AE-1 / AE-2) is represented in ZIP **local file headers** and **central directory entries**, how it differs from **ZipCrypto** and **PKWARE strong encryption**, and how to identify each variant in the wild.

NeoZipKit implements WinZip AES-256 (AE-1) in `src/core/encryption/AesCrypto.ts` and encodes headers in `src/core/ZipEntry.ts`. Constants live in `src/core/constants/Headers.ts` (`CMP_METHOD.AES_ENCRYPT`, `HDR_ID.AES`, `GP_FLAG`).

**Primary spec reference:** [WinZip AES encryption](https://www.winzip.com/en/support/aes-encryption/).

---

## 1. Two different “version” axes

### 1.1 AE-1 vs AE-2 (vendor version in extra field 0x9901)

These are **not** different ciphers. They differ in whether the **CRC-32** in the ZIP headers is populated.

| Vendor version (in 0x9901) | Name  | CRC-32 in local + central headers |
|----------------------------|-------|-----------------------------------|
| **1**                      | **AE-1** | Real CRC of **plaintext** (uncompressed file). |
| **2**                      | **AE-2** | **0**. Integrity relies on **HMAC-SHA1** over the ciphertext; plaintext CRC may be unknown when headers are written. |

In NeoZipKit, this is `ZipEntry.aesVersion` (1 or 2). When writing headers, CRC is forced to **0** for AE-2.

### 1.2 AES-128 / AES-192 / AES-256 (strength byte in 0x9901)

The **encryption strength** byte in the 0x9901 data describes **key length** (and, per the WinZip spec, **salt length** and derived key sizes):

| Strength byte | Meaning   |
|---------------|-----------|
| **1**         | AES-128   |
| **2**         | AES-192   |
| **3**         | AES-256   |

NeoZipKit sets `ZipEntry.aesStrength` and currently implements **AES-256** in `AesCrypto` (salt size 16 bytes, 32-byte AES key, etc.).

---

## 2. Cryptographic payload layout (per entry)

After the local file header, the **file data** for a WinZip AES entry is:

```
[salt][password verifier (2 bytes)][AES-CTR ciphertext][HMAC-SHA1 first 10 bytes]
```

- **Key derivation:** PBKDF2-HMAC-SHA1, 1000 iterations (WinZip default).
- **Cipher:** AES in **CTR** mode with WinZip’s **little-endian counter** increment (not the same as all generic AES-CTR implementations).
- **Authentication:** HMAC-SHA1 over the **encrypted** payload (Encrypt-then-MAC style layout); **10-byte** truncation.

The **plaintext** is the **compressed** stream (e.g. deflate) when the real compression method is not stored.

---

## 3. Extra field 0x9901 (WinZip AES)

**Header ID:** `0x9901` (little-endian on disk: `01 99`).

Total size in NeoZipKit: **11 bytes** (`AES_EXTRA_FIELD_SIZE`):

| Offset (within extra field) | Size | Content |
|----------------------------|------|---------|
| 0 | 2 | Extra field ID = `0x9901` |
| 2 | 2 | Data size = **7** |
| 4 | 2 | Vendor version: **1** = AE-1, **2** = AE-2 |
| 6 | 2 | Vendor ID = `0x4541` → bytes `41 45` → ASCII **`"AE"`** |
| 8 | 1 | Strength: **1** / **2** / **3** (128 / 192 / 256) |
| 9 | 2 | **Real** compression method (e.g. **0** = stored, **8** = deflate) |

The **compression method** fields in the local and central headers are **not** the real algorithm for the ciphertext. They are set to **99** so legacy tools that do not implement WinZip AES **fail with “unsupported compression method 99”** instead of mis-decoding the stream.

`ZipEntry.realCmpMethod` holds the value stored in the last two bytes of the 0x9901 data.

---

## 4. Local file header vs central directory

For a given entry, **local** and **central** records are **consistent** with each other for:

| Field | WinZip AES (typical) |
|-------|----------------------|
| **Compression method** | **99** |
| **Version needed to extract** | **51** (ZIP “5.1”) when using AES — NeoZipKit uses `VER_AES_EXTRACT` (51) for these entries. |
| **General purpose bit 0** | Set (**encrypted**). |
| **General purpose bit 6** | Usually **clear** for WinZip AES (unlike PKWARE “strong” encryption, which uses bit 6). |
| **CRC-32** | AE-1: plaintext CRC; AE-2: **0**. |
| **Compressed size** | Length of **full** AES payload (salt + verifier + ciphertext + 10-byte MAC). |
| **Uncompressed size** | Plaintext (uncompressed) size. |
| **Extra field** | Includes one **0x9901** block (same semantics in both records; may be duplicated in LOC and CEN). |

The central directory **local header offset** must point to the **start** of that entry’s local header; the encrypted payload immediately follows the local header + filename + extra.

---

## 5. Identifying encryption types

### 5.1 WinZip AES (including AES-256)

1. **Compression method** = **99**.
2. Extra field **0x9901** present with:
   - vendor ID **"AE"** (`41 45` after the 4-byte extra header + vendor version),
   - vendor version **1** or **2**,
   - strength **1 / 2 / 3**.
3. **AES-256** specifically: strength byte = **3**.

### 5.2 Traditional ZipCrypto (weak)

- **Compression method** is the **real** method (e.g. **8** deflate), **not** 99.
- **Bit 0** of general purpose flags: encrypted.
- **No** 0x9901 WinZip AES block.
- Different payload layout (12-byte header + “encrypted” compressed stream).

### 5.3 PKWARE strong / certificate-based encryption

- **Bit 6** of general purpose flags: **strong encryption** (`GP_FLAG.STRONG_ENCRYPT` = 64 in NeoZipKit’s `Headers.ts`).
- Often uses extra fields such as **0x0017** (Strong Encryption Header) and **0x0014–0x0016** (PKCS#7 / certificate-related), per the ZIP application note.
- **Not** the same as method **99** + **0x9901**. A reader that only implements WinZip AES cannot decrypt PKWARE strong ZIPs.

### 5.4 Quick comparison table

| Signal | WinZip AES | ZipCrypto | PKWARE strong (typical) |
|--------|------------|-----------|-------------------------|
| Compression method | **99** | 0, 8, … | Often real method (e.g. 8) |
| GP bit 0 (encrypted) | Set | Set | Often set |
| GP bit 6 (strong) | Usually **clear** | Clear | **Set** |
| Extra **0x9901** (“AE”) | **Yes** | No | No |
| Extra **0x0017** | No | No | Often **yes** |
| CRC in header (WinZip AES) | AE-1: real; AE-2: **0** | ZipCrypto rules | Varies |

### 5.5 Other tools

- **7-Zip** and **The Unarchiver** (`unar` / `lsar`) often support **WinZip AES** (same **99** + **0x9901** pattern).
- **macOS `/usr/bin/unzip`** (Info-ZIP 6.x) typically does **not** support method 99.
- Some products use **proprietary** ZIP extensions; **method 99** without a valid **0x9901** should be treated as non-standard or corrupt until verified.

---

## 6. Related NeoZipKit files

| Area | Path |
|------|------|
| AES crypto (PBKDF2, CTR, HMAC, 0x9901 build/parse) | `src/core/encryption/AesCrypto.ts` |
| LOC/CEN headers, extra field read/write | `src/core/ZipEntry.ts` |
| Constants (method 99, 0x9901, flags) | `src/core/constants/Headers.ts` |
| Creating AES ZIPs (Node) | `src/node/ZipkitNode.ts`, `src/node/ZipCompressNode.ts` |
| Examples | `examples/create-aes-zip.ts`, `examples/extract-aes-zip.ts` |
| Testing notes | `docs/UNIT_TESTING.md` (AES section) |

---

## Document history

- Added to document WinZip AES encoding and distinction from ZipCrypto and PKWARE strong encryption (NeoZipKit).
