# NeoEncrypt (NEO AES-256) — NeoZip extra field

NeoEncrypt is a **NeoZip-specific** encryption format. It does **not** use WinZip compression method **99** or extra field **0x9901**. Third-party tools will not decrypt these entries unless they implement this spec.

**Related:** [WINZIP_AES_FORMAT.md](./WINZIP_AES_FORMAT.md) (separate path). See [APPNOTE.txt](./APPNOTE.txt) for general ZIP structure.

## Identification

- **General purpose bit 0** (encrypted) is set.
- Central and local directory **each** include a valid **NEO crypto** extra field (`HDR_ID.NEO_CRYPTO`).
- **Compression method** in LO/CEN is a **normal** ZIP value (**0** = stored, **8** = deflate, **93** = zstd, …)—**not** a Neo-specific method code.

NeoZipKit chooses **NeoEncrypt decryption** when the NEO extra is present; otherwise an encrypted entry without this extra uses **ZipCrypto** (or WinZip AES if method **99** + 0x9901).

**Warning:** Generic `unzip` often assumes **ZipCrypto** for “encrypted + deflate” and will **not** extract NeoEncrypt archives correctly. Use NeoZipKit or Neo-aware tools.

## Extra field header

| Field | Size | Value |
|-------|------|--------|
| Header ID | 2 | `0x024E` (little-endian on disk: `4E 02` — ASCII `N` + byte `0x02`, sibling pattern to SHA256 extra `0x014E`) |
| Data size | 2 | `11` for payload format version 1 |

## Payload (data portion), version 1

| Offset | Size | Field |
|--------|------|--------|
| 0 | 4 | **Magic** ASCII `NEZ\0` (`0x4E` `0x45` `0x5A` `0x00`) |
| 4 | 1 | **Payload format version** (`1`) |
| 5 | 2 | **Encryption algorithm ID** (`1` = NEO AES-256 v1; reserve `2+` for future algorithms) |
| 7 | 2 | **Flags** (`0` reserved for v1) |
| 9 | 2 | **Reserved** (`0` for v1) |

The extra describes **encryption only**. It does **not** duplicate or override the ZIP compression method; after decryption, decompress using `entry.cmpMethod`.

## Extensibility

- Increase **payload format version** for incompatible layout changes.
- New **encryption algorithm IDs** under the same `HDR_ID.NEO_CRYPTO` for future ciphers (e.g. AEAD variants).
- Optional future: **flags** + **extension length** + trailing bytes when flags indicate extensions.

## Encryption algorithm 1 (NEO AES-256 v1)

Ciphertext layout in the **local file data** (after local header + filename + extra) matches the **same byte layout** as WinZip AES-256 in NeoZipKit’s `AesCrypto`:

`salt (16) + password verifier (2) + AES-CTR ciphertext + HMAC-SHA1 first 10 bytes`

- PBKDF2-HMAC-SHA1, 1000 iterations, same composite key layout as WinZip AES-256.
- AES-256 CTR with **little-endian** counter increment (WinZip convention).

Only the **metadata** differs: Neo uses **`0x024E`** extra + **standard** compression method; WinZip uses **99** + **0x9901**.

## CRC and version needed to extract

- **CRC-32** in LO/CEN: plaintext (uncompressed) CRC, same as WinZip AE-1 style for v1.
- **Version needed to extract:** use **10** for typical deflate/store, or **51** if you standardize on “strong crypto” readers—product choice; NeoZipKit may use **10** when `cmpMethod` is 8.

## General purpose flags

- Set **bit 0** (encrypted).
- **Do not** set **bit 6** (strong encryption) for NeoEncrypt unless fully implementing PKWARE strong encryption.

## Conflicts

| Mechanism | Conflict? |
|-----------|-----------|
| WinZip AES (99 + 0x9901) | No — different method and extra ID. |
| ZipCrypto | No — NeoZipKit dispatches on NEO extra. |
| SHA256 extra (`0x014E`) | No — different ID (`0x024E`). |
