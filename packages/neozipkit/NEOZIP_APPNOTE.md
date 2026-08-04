# NeoZip Application Note

**Format:** `.nzip` (ZIP profile)  
**Version:** 0.1.0  
**Status:** Release — extends PKWARE APPNOTE 6.3.10  
**Date:** 2026-08-03  
**Base specification:** PKWARE [APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) (`.ZIP` File Format Specification, Version 6.3.10)  
**Scope:** Compression, encryption, integrity, and blockchain / Token Service extensions used by current NeoZip CLI releases. Optional **AI-aware** metadata (`META-INF/manifest.json`) is defined for future agent ingestion; it is **not** required for minting, timestamping, or integrity verification.

---

## 0. Purpose and relationship to PKWARE APPNOTE

This document defines the **NeoZip profile** of the ZIP format: a compatible ZIP container with optional integrity and blockchain payloads, plus NeoZip compression defaults.

1. Every `.nzip` file **MUST** be a valid ZIP per PKWARE APPNOTE 6.3.10.
2. This profile **adds** entry-name conventions, Extra Field IDs, compression methods, and `META-INF/` payloads.
3. Features that are not present in a given archive are simply absent; readers **MUST** ignore unknown Extra Fields and unknown `META-INF/` entries (APPNOTE §4.5 / §4.6).
4. Normative PKWARE record layouts (local headers, central directory, EOCD, Zip64, encryption headers) are **not** restated here — implementers use APPNOTE.TXT for those.

Where this document conflicts with PKWARE on wire layout, **PKWARE wins**. Where this document defines NeoZip-only conventions (entry names, Extra Field `0x014E`, `META-INF/*.NZIP`), this document wins for NeoZip-aware tools.

---

## 1. Recommendation: `META-INF/`, `MANIFEST.MF`, and `manifest.json`

### 1.1 What APPNOTE actually says

PKWARE APPNOTE §4.1.11 and §4.7:

- Manifest files **MAY** be used for application-specific information.
- A manifest **SHOULD** be the **first** entry in the ZIP.
- A manifest **MAY be of any file type** required by the application.
- One *example* is `META-INF/MANIFEST.MF` in JAR files.
- Manifest files are **outside the scope** of the PKWARE specification.

APPNOTE does **not** require `MANIFEST.MF`, does not require Java attribute syntax, and does not forbid JSON.

### 1.2 Why `MANIFEST.MF` is a poor home for NeoZip JSON

| Concern | Detail |
| :---- | :---- |
| Format clash | JAR `MANIFEST.MF` is line-oriented `Name: Value` attributes (UTF-8), not JSON. A JSON body breaks Java/`jar` tooling. |
| Tooling assumptions | Many ZIP/JAR scanners special-case `META-INF/MANIFEST.MF` and expect Java Main-Class / Sealed attributes. |
| Compatibility with NeoZip today | NeoZip already stores blockchain sidecars as `META-INF/TOKEN.NZIP`, `META-INF/TIMESTAMP.NZIP`, `META-INF/TS-SUBMIT.NZIP` — not as `MANIFEST.MF`. |
| Structured metadata (optional) | Integrity digests, merkle summaries, and AI context need structured fields when agents are the consumer. JSON (or CBOR later) is the right carrier; attribute-list MF is not. Core crypto still uses Extra Fields and `*.NZIP` sidecars. |

### 1.3 Recommendation (normative for this profile)

1. **Use the directory `META-INF/`** for all NeoZip sidecars and optional AI-aware manifests. Do not invent a parallel `METADATA/` tree.
2. **Optional AI-aware manifest:** `META-INF/manifest.json` is an **OPTIONAL** structured discovery payload for AI agents, LLMs, and automated tools. Existing NeoZip CLI blockchain features (minting, timestamping, and integrity verification) **DO NOT** require this file.
3. **When written**, `META-INF/manifest.json` **SHOULD** be the **first** ZIP entry (APPNOTE §4.1.11 / §4.7.2), **MAY** be STORED or Deflate/Zstd-compressed (STORED is **RECOMMENDED**), and **MUST** be UTF-8 JSON (§3).
4. **Do not put JSON in `META-INF/MANIFEST.MF`.** Leave that name for optional Java-compatible stubs only.
5. **Optional bridge file** `META-INF/MANIFEST.MF` (Java attribute syntax) **MAY** be written as a thin pointer for JAR-aware tools:

   ```
   Manifest-Version: 1.0
   NeoZip-Specification-Version: 0.1
   NeoZip-Manifest: META-INF/manifest.json
   Created-By: NeoZip/1.0
   ```

   Consumers that understand NeoZip **MUST** prefer `META-INF/manifest.json` over `MANIFEST.MF` when both are present.
6. **Discovery rule for NeoZip-aware tools:**  
   An archive is recognized as a NeoZip profile if **any** of the following are present:
   - Extra Field `0x014E` on one or more content entries.
   - Sidecar proof entries `META-INF/TOKEN.NZIP` or `META-INF/TIMESTAMP.NZIP` (or pending `META-INF/TS-SUBMIT.NZIP`).
   - Optional AI-aware manifest `META-INF/manifest.json` with `"format": "neozip"`.

   Absence of all of the above means a plain ZIP (or JAR / other profile).

> **Note for implementers:** Minting, timestamping, and Merkle verification in current NeoZip CLI releases **MUST NOT** depend on `manifest.json` being present. Core cryptographic operations rely on central-directory entries, Extra Field `0x014E`, and `META-INF/*.NZIP` sidecars.

---

## 2. Archive layout (v0)

### 2.1 Minimal NeoZip archive (blockchain / integrity only)

Blockchain, timestamping, and integrity work without an AI-aware manifest:

```
hello.txt.nzip
  META-INF/TOKEN.NZIP             # on-chain token binding (when minted)
  hello.txt                       # original payload with Extra Field 0x014E
```

Timestamped archives may instead (or also) carry `META-INF/TIMESTAMP.NZIP` / `META-INF/TS-SUBMIT.NZIP`.  
Per-file SHA-256 **SHOULD** appear in Extra Field `0x014E` on each content entry’s local/central header (§5). The Merkle root is computed from central-directory content entries (§6), not from a manifest index.

### 2.2 Optional AI-aware archive (future / agent-oriented)

```
knowledge_bundle.nzip
  META-INF/manifest.json          # AI context, schema summary, content index (optional)
  META-INF/TOKEN.NZIP             # optional blockchain proof
  docs/guide.md                   # payload file(s)
```

`META-INF/manifest.json` is reserved for structured discovery so AI tools can understand the archive without parsing low-level headers. It is not required for L1–L3 cryptographic proof.

### 2.3 Blockchain / Token Service sidecars

When present, these **MUST** live under `META-INF/`:

| Entry | When written | Purpose |
| :---- | :---- | :---- |
| `META-INF/TOKEN.NZIP` | After successful mint (`neozip mint` / `-b`) | On-chain token binding (tokenId, contract, tx, merkleRoot, …) |
| `META-INF/TIMESTAMP.NZIP` | After confirmed Token Service stamp (`-ts` / `upgrade`) | Timestamp proof metadata |
| `META-INF/TS-SUBMIT.NZIP` | After stamp submit, before confirm | Pending timestamp submission |

Alternate token entry recognized by NeoZip: `META-INF/NZIP.TOKEN` (legacy, also uppercase).  
Writers **MUST** emit the canonical uppercase forms above. NeoZip-aware readers (including NeoZip CLI) **MUST** discover these reserved paths with **ASCII case-insensitive** comparison (see §2.4), so `META-INF/token.nzip` is accepted for discovery; writers must still not emit that spelling.

These files are NeoZip application payloads (JSON or versioned binary envelopes as implemented by NeoZip). Generic unzip tools treat them as ordinary files under `META-INF/` and typically do not present them as “the” content of the archive.

### 2.4 Path case rules (reserved meta names)

ZIP stores entry names as opaque byte strings (case-preserving). This profile separates **what writers emit** from **what readers accept**.

**Canonical forms (writers MUST emit exactly these spellings when writing the entry):**

| Role | Canonical path |
| :---- | :---- |
| Directory | `META-INF/` (uppercase, JAR/APPNOTE convention) |
| Optional AI-aware manifest | `META-INF/manifest.json` |
| Token / timestamp | `META-INF/TOKEN.NZIP`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP` |

**Reader lookup for reserved meta paths (NeoZip-aware tools MUST):**

1. Match the reserved prefixes and filenames with **ASCII case-insensitive** comparison  
   (`META-INF/manifest.json` ≡ `meta-inf/Manifest.JSON` ≡ `META-INF/MANIFEST.JSON` for *discovery*).  
   The same rule applies to `TOKEN.NZIP`, `NZIP.TOKEN`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP`, and the OTS equivalents.
2. If **more than one** central-directory entry matches the same reserved meta target under ASCII case-insensitive comparison, the archive is **malformed**. Readers **MUST** reject it and **MUST NOT** recover by preferring the canonical spelling, the first match, or any other silent selection. Silent recovery creates parser differentials across NeoZip reader implementations.
3. Paths **inside** content payloads (the original document’s own name) stay as stored; case folding applies only to reserved `META-INF/**` profile entries, not to arbitrary archive members.
4. Paths recorded *inside* `manifest.json` bodies **SHOULD** use canonical casing when written; readers resolving those pointers **MUST** also try ASCII case-insensitive match within the ZIP central directory. If that resolution yields multiple case-insensitive matches for one reserved target, apply rule 2 (reject as malformed).

**Why writers stay strict:** one spelling keeps central-directory scans trivial, matches NeoZip’s emitted uppercase token files, and prevents duplicate leaf names that break Windows extraction.

**Why readers fold:** Windows unzip and some GUI tools fold case on extract/repack; hand-edited or round-tripped archives may alter spelling. Case-insensitive *discovery* avoids silent “not tokenized / not stamped” misses while keeping writer output deterministic. Case-insensitive *deduplication* is not recovery: duplicate reserved leaves are a hard error.

### 2.5 Root entry rules

1. All token and timestamp data **MUST** be under `META-INF/`.
2. Content payloads are every ZIP entry outside `META-INF/`.
3. When optional `manifest.json` is present, content payloads **SHOULD** be listed in `manifest.json` `content[]` for AI discovery; cryptographic Merkle construction still uses the central directory (§6).
4. A general NeoZip archive **MAY** contain many content entries without blockchain sidecars and without `manifest.json`.

---

## 3. `META-INF/manifest.json` schema (AI-aware extension)

`META-INF/manifest.json` is an **OPTIONAL** payload reserved for AI systems, automated agents, and future AI-aware tooling. It provides a pre-parsed, human- and machine-readable overview of the archive’s structure, semantic contents, and profile summaries so tools can understand the ZIP without parsing low-level binary headers.

> **Note for implementers:** Existing NeoZip CLI tools performing minting, timestamping, or verification **MUST NOT** depend on `manifest.json` being present. All core cryptographic operations rely directly on standard central-directory entries, Extra Field `0x014E`, and `META-INF/*.NZIP` sidecars.

When the file is present, the body is a UTF-8 JSON object. Unknown keys **MUST** be preserved on round-trip by NeoZip-aware writers when possible; unknown keys **MUST NOT** cause readers to reject the archive.

### 3.1 Required fields (when `manifest.json` is present)

| Field | Type | Description |
| :---- | :---- | :---- |
| `format` | string | `"neozip"` |
| `specVersion` | string | This note’s version, e.g. `"0.1.0"` |
| `createdAt` | string | ISO-8601 creation time |

### 3.2 Recommended fields

| Field | Type | Description |
| :---- | :---- | :---- |
| `content` | array | Content index for agents (non-`META-INF/` files). Each: `{ "path", "sha256", "size", "mimeType?" }`. Informational only; Merkle leaves come from the central directory (§6). |
| `merkleRoot` | string | Optional hex copy of the content Merkle root for agents (§6). Authoritative on-chain binding remains in `TOKEN.NZIP` / `TIMESTAMP.NZIP` when present. |
| `profiles` | string[] | Declared profiles, e.g. `["integrity"]`, `["tokenized"]`, `["timestamped"]`, `["ai-aware"]` |
| `blockchain` | object | Token / network summary when tokenized (full proof remains in `TOKEN.NZIP`) |
| `timestamp` | object | Stamp summary when stamped (full proof in `TIMESTAMP.NZIP`) |
| `compression` | object | Defaults: `{ "method": "zstd" \| "deflate" \| "store", "level"?: number }` |
| `encryption` | object | `{ "method": "none" \| "neo-aes-256" \| "aes-256" \| "pkzip" }` (`neo-aes-256` = NeoZip default AES / NeoEncrypt) |

### 3.3 Example (AI-aware integrity summary, not tokenized)

```json
{
  "format": "neozip",
  "specVersion": "0.1.0",
  "createdAt": "2026-08-02T12:00:00Z",
  "profiles": ["integrity", "ai-aware"],
  "compression": { "method": "zstd", "level": 6 },
  "encryption": { "method": "none" },
  "merkleRoot": "407cad6b3c7e7ae5be1dd802dba0186c781f7de899eb77f7d8d411a10207518b",
  "content": [
    {
      "path": "hello.txt",
      "sha256": "9f2c…",
      "size": 12,
      "mimeType": "text/plain"
    }
  ]
}
```

### 3.4 Example (tokenized summary fields for agents)

```json
{
  "format": "neozip",
  "specVersion": "0.1.0",
  "createdAt": "2026-08-02T12:00:00Z",
  "profiles": ["integrity", "tokenized", "timestamped", "ai-aware"],
  "compression": { "method": "zstd", "level": 6 },
  "encryption": { "method": "none" },
  "merkleRoot": "407cad6b3c7e7ae5be1dd802dba0186c781f7de899eb77f7d8d411a10207518b",
  "content": [
    {
      "path": "hello.txt",
      "sha256": "9f2c…",
      "size": 12
    }
  ],
  "blockchain": {
    "tokenId": "42",
    "network": "base-sepolia",
    "contractAddress": "0x…"
  },
  "timestamp": {
    "status": "confirmed"
  }
}
```

Full on-chain and Token Service proofs remain in `META-INF/TOKEN.NZIP` / `TIMESTAMP.NZIP`; when present, `manifest.json` holds agent-facing discovery summaries only.

---

## 4. Compression and encryption

### 4.1 Compression methods

| Method | APPNOTE method ID | NeoZip default | Notes |
| :---- | :---- | :---- | :---- |
| Store | 0 | optional (`-0`) | Required for selective-read of small metadata when desired |
| Deflate | 8 | via `--deflate` / `--legacy` | Info-ZIP compatible path |
| Zstd | **93** | **default** | Official PKWARE APPNOTE 6.3.8+ assignment (method 20 deprecated). Readable by Zstd-aware ZIP tools (e.g. WinZip 25+). Stock Info-ZIP `unzip` generally cannot; use `--legacy` / Deflate for that path. |

Writers using Zstd **MUST** set general-purpose flags and version-needed fields consistently with NeoZip implementation practice. When optional `manifest.json` is written, writers **SHOULD** document the method in `compression.method`.

Readers that do not understand method 93 **MUST** report a clear unsupported-method error (not silent data loss).

**Legacy interoperability:** `neozip --legacy` forces Deflate (or Store at `-0`) and disables NeoZip extensions (Zstd, blockchain `-b`/`-bd`/`-bm`, `-ots`, `-ts`) so stock Info-ZIP `unzip` can read the archive.

### 4.2 Encryption

| Method | Flag / option | Wire identification | Notes |
| :---- | :---- | :---- | :---- |
| None | default for many workflows | Bit 0 clear | Allowed |
| NeoEncrypt (NEO AES-256) | `-e` / `--aes256` (NeoZip default AES) | **Normal compression method** (0 / 8 / 93 / …) + Extra Field **`0x024E`** | NeoZip product default for confidential archives. Ciphertext stream matches WinZip AES-256 (PBKDF2, CTR, HMAC); headers do **not** use method 99 or `0x9901`. Stock Info-ZIP often misreads this path. |
| WinZip AES-256 | library `encryptionMethod: 'aes256'` | **Compression method 99** + Extra Field **`0x9901`** | Industry AE-1/AE-2 encoding. NeoZip **reads** (and may write for interop) this form; it is **not** the NeoZip default for `-e`. |
| Traditional PKZIP (ZipCrypto) | `--pkzip` | Bit 0 set; no AES extra | Legacy interoperability only; weak by modern standards. Forced by `--legacy` when encrypting. |

#### 4.2.1 NeoEncrypt (default NeoZip AES-256)

NeoZip’s default AES-256 path is **NeoEncrypt** (see NeoZipKit `docs/NEO_CRYPTO_FORMAT.md`):

1. Local and central directory **compression method** stays the **real** codec (store / deflate / zstd…).
2. General-purpose **bit 0** (encrypted) is set.
3. Extra Field **`0x024E`** (`HDR_ID.NEO_CRYPTO`) carries NeoEncrypt metadata (magic `NEZ\0`, format version, algorithm id = AES-256 v1). Distinct from integrity Extra Field **`0x014E`**.
4. File data payload is the same layout as WinZip AES-256: `salt ‖ password-verifier(2) ‖ AES-CTR ciphertext ‖ HMAC-SHA1(10)`.

NeoZip CLI `-e` / `--encrypt` / `--aes256` **MUST** emit this form. Generic tools that assume ZipCrypto for “encrypted + deflate/zstd” will not extract correctly — use NeoZip / NeoZipKit.

#### 4.2.2 WinZip AES (recognized; different encryption codes)

WinZip AE-x is a separate on-wire profile (PKWARE method **99** + Extra Field **`0x9901`**):

1. LO/CEN compression method is **99** (real method lives inside `0x9901`).
2. Extra Field **`0x9901`**: vendor version (AE-1 = 1, AE-2 = 2), vendor ID `"AE"`, strength (1/2/3), real compression method.
3. Ciphertext layout matches NeoEncrypt’s AES-256 stream for strength 3.

| | NeoEncrypt (NeoZip default) | WinZip AES (interop) |
| :---- | :---- | :---- |
| Compression method in LO/CEN | Real method (**0**, **8**, **93**, …) | **99** |
| Extra Field ID | **`0x024E`** | **`0x9901`** |
| Ciphertext layout | WinZip AES-256 stream | Same (for AES-256) |
| NeoZip CLI default `-e` | **Yes** | No (kit API `encryptionMethod: 'aes256'` for explicit WinZip write) |
| NeoZipKit / NeoZip CLI extract | **Yes** | **Yes** (recognized on read) |

Writers **MUST NOT** place both `0x9901` and `0x024E` on the same entry. Readers that support both **MUST** discriminate on Extra Field ID / method 99, not on “encrypted + password” alone.

When optional `manifest.json` is written, writers **SHOULD** set `encryption.method` to `"neo-aes-256"` (default NeoZip AES), `"aes-256"` (WinZip AE), `"pkzip"`, or `"none"`.

Encryption of `META-INF/*.NZIP` public proofs and of optional `META-INF/manifest.json` is **DISCOURAGED** when discovery matters (tools cannot find digests/proofs). Prefer encrypting content entries while leaving `META-INF/` public proofs readable, unless the entire archive is confidential.

---

## 5. Extra Field: NeoZip SHA-256 (`0x014E`)

### 5.1 Layout

Present in local and/or central directory Extra Field (APPNOTE §4.5).

```
Header ID   = 0x014E          (2 bytes, little-endian)  // NeoZip "N" family
Data Size   = 32              (2 bytes)
SHA-256     = <32 bytes>      // digest of this entry's uncompressed payload
```

Observed in NeoZip 1.0 (2026-07-27) alongside Info-ZIP UT `0x5455`.

### 5.2 Semantics

- Digest **MUST** be SHA-256 over the entry’s **uncompressed** file data (same bytes a correct extract would write).
- For the archive merkle root (§6): under **v0**, leaf hashes **SHOULD** equal these per-entry digests; under **v1**, leaves are `SHA-256(0x00 ‖ uncompressed_bytes)` and **MUST NOT** be confused with the bare `0x014E` value (see §6.3).
- Unknown Extra Fields: APPNOTE requires readers to skip; NeoZip-unaware tools remain compatible.

### 5.3 Reserved NeoZip Extra Field space

For future registration / local use (not yet assigned in this draft):

| ID | Status | Intended use |
| :---- | :---- | :---- |
| `0x014E` | **Assigned** | Per-entry SHA-256 |
| `0x014F`–`0x0153` | Reserved (NeoZip) | Merkle / profile hints (TBD; sidecars and Extra Fields first; optional `manifest.json` for agents) |

Third-party IDs **MUST** follow APPNOTE §4.6 (do not collide with PKWARE 0x0001–0x0065 and published third-party IDs).

---

## 6. Merkle root and integrity

### 6.1 Purpose

Provide a single digest for the archive’s protected content so Token Service timestamps and blockchain tokens bind to **bytes**, not filenames alone.

Two algorithms are defined:

| Algorithm | Status | Odd-leaf rule | Domain separation |
| :---- | :---- | :---- | :---- |
| **v0** (§6.2) | Legacy | Duplicate last leaf (Bitcoin-style) | None |
| **v1** (§6.3) | Current | Promote odd node unhashed ([RFC 6962](https://datatracker.ietf.org/doc/html/rfc6962)–style) | `0x00` leaf / `0x01` interior |

New archives **MUST** compute the Merkle root with **v1** and bind it where proofs require it (e.g. `TOKEN.NZIP` / `TIMESTAMP.NZIP` `merkleRoot`). Writers that emit optional `manifest.json` **SHOULD** mirror the same hex root in `manifest.json` `merkleRoot` for agents. Verifiers **MUST** accept both algorithms under the rules in §6.4 so legacy on-chain bindings remain checkable.

Rationale for v1 (hardening over v0):

1. **Odd-leaf duplication (CVE-2012-2459 class):** Bitcoin-style `H_n ‖ H_n` pairing allows second-preimage trees of different depth/structure that share a root. Pass-through promotion removes that class of ambiguity.
2. **Leaf vs interior collision:** Without domain separation, a 64-byte content file equal to `H_left ‖ H_right` can make a leaf digest collide with an interior node. Prefix bytes `0x00` / `0x01` separate the domains.
3. **Path sort ambiguity:** Writers and verifiers **MUST** normalize paths before sorting so Windows/`./`/Unicode NFC variants cannot reorder leaves.

Reference design notes: [Merkle Root calculation — RFC 6962](https://docs.google.com/document/d/1jc-krTiFWpdeWTUmi8gSRAbVQemz834XxPPgevvQ6gE/edit?usp=sharing).

### 6.2 v0 algorithm (legacy)

**Status:** legacy. Writers **MUST NOT** emit new proof-bound roots with v0. Verifiers retain v0 only for §6.4 fallback against existing on-chain / Token Service records.

1. Collect all non-`META-INF/` content entries **directly from the ZIP central directory** (exclude every entry whose name is under `META-INF/**`).
2. For each entry, take `H_leaf = SHA-256(uncompressed bytes)` (= Extra Field `0x014E` value when present).
3. Sort leaves by central-directory path (UTF-8 byte order). Path normalization was not required by v0; verifiers reconstructing v0 roots **SHOULD** use the path bytes exactly as stored in the central directory file name.
4. Build a binary merkle tree with SHA-256. **Odd-leaf rule:** when a level has an odd count, **duplicate the last leaf** before pairing (Bitcoin-style):  
   `H_parent = SHA-256(H_left ‖ H_right)` with no domain prefix.
5. Bind the hex root in token/timestamp payloads (historical archives only). When optional `manifest.json` is present, a historical copy **MAY** appear as `merkleRoot`.

For a single content entry, a v0 root **MAY** equal that entry’s SHA-256 (single-leaf tree).

### 6.3 v1 algorithm (RFC 6962–style, current)

**Status:** current. Writers **MUST** use v1 for new archives.

1. Collect all non-`META-INF/` content entries **directly from the ZIP central directory** (exclude every entry whose name is under `META-INF/**`). Do **not** require `manifest.json` `content[]` for Merkle construction.
2. **Normalize each entry path** before sorting:
   - Decode as UTF-8 (central-directory file name bytes per APPNOTE).
   - Use POSIX separators only (`/` — convert `\` to `/`).
   - Strip a single leading `./` if present, then strip leading `/` characters.
   - Canonicalize to Unicode **NFC**.
3. Sort entries strictly by the normalized path’s UTF-8 **byte** order.
4. **Leaf hash** for each entry (domain-separated):  
   `H_leaf = SHA-256(0x00 ‖ uncompressed_bytes)`  
   where `uncompressed_bytes` are the same bytes hashed into Extra Field `0x014E` (payload content only — **not** the path).  
   Note: `0x014E` remains `SHA-256(uncompressed_bytes)` without the `0x00` prefix; the leaf prefix applies only when folding digests into the merkle tree. Implementations **MUST** either re-hash content with the `0x00` prefix or equivalently compute `SHA-256(0x00 ‖ payload)` from stored bytes; they **MUST NOT** treat the raw `0x014E` digest as `H_leaf` under v1.
5. **Tree hash** (RFC 6962–style):
   - Pair adjacent hashes `(H_i, H_{i+1})` →  
     `H_parent = SHA-256(0x01 ‖ H_i ‖ H_{i+1})`.
   - If a level has an **odd** count, **promote** the last node to the next level **unhashed** (do not duplicate / self-hash).
6. Repeat until one root remains. Store the lowercase hex encoding of the 32-byte root in token/timestamp payloads. When optional `manifest.json` is written, writers **SHOULD** copy the same value into `manifest.json` `merkleRoot` for agent discovery.

For a single content entry, the v1 root **MUST** equal `SHA-256(0x00 ‖ uncompressed_bytes)` (single-leaf tree with domain separation — **not** the bare `0x014E` digest).

**Future consideration (not part of v1):** if per-file inclusion proofs need to bind path identity into the leaf, a later algorithm version may use  
`H_leaf = SHA-256(0x00 ‖ path_bytes ‖ 0x00 ‖ uncompressed_bytes)`. That change would be a new algorithm id, not a silent tweak to v1.

### 6.4 Verification

Verification rebuilds a candidate root from **central-directory content entries** and compares it, when present, to on-chain / Token Service records (`TOKEN.NZIP`, `TIMESTAMP.NZIP`). Optional `manifest.json` `merkleRoot` is a convenience check for agents and **MUST NOT** be the sole source of truth when a sidecar / on-chain root is available.

**Primary path (declared AI-aware version):**

1. If `manifest.json` is present and contains `specVersion`, compute the Merkle root with the **v1** algorithm (§6.3) and compare to the declared / on-chain root.
2. Match → verification **SUCCESS** (high security).
3. Mismatch → do **not** stop yet; continue with the fallback pass below when verifying against an external (on-chain / Token Service) record, so legacy bindings remain checkable. Local-only checks that require a v1 match **MAY** fail immediately when the writer is known to be v1-only.

**Fallback pass (`manifest.json` / `specVersion` omitted, unverified, or v1 mismatch against an on-chain record):**

1. Compute the **v1** root → compare with the on-chain / Token Service record.  
   - Match → verification **SUCCESS** (**High Security**).
2. Else compute the **v0** root (§6.2) → compare with the on-chain / Token Service record.  
   - Match → verification **SUCCESS** (**Legacy Security**); the verifier **MUST** issue a warning that the archive uses the legacy merkle algorithm (odd-leaf duplication / no domain separation).
3. Else verification **FAIL**.

**CLI behavior (informative):**

- `neounzip -T` / `--pre-verify`: apply §6.4; on legacy (v0) success, surface a warning on stderr (and in JSON mode, a structured warning field when available).
- Hard mismatch after both algorithms → verification **MUST** fail; extract **MAY** still proceed only with an explicit override (`--skip-blockchain`).

Implementations **MUST NOT** accept an archive as high-security verified solely because a v0 root matched when a v1 root also could have been tried first — the fallback order above is mandatory so v1 is preferred whenever it matches.

---

## 7. Blockchain and Token Service

### 7.1 Networks

NeoZip CLI and `neozip-blockchain` default to **Base Sepolia** (`base-sepolia`, chain ID `84532`) for development.

Token Service hosts (client library selection via `TOKEN_SERVICE_NETWORK` / `resolveNetworkProfile`):

| Profile | Chain | Token Service host |
| :------ | :---- | :----------------- |
| `base-sepolia` (default) | Base Sepolia `84532` | `https://testnet.token-service.neozip.io` |
| `base` | Base Mainnet `8453` | `https://token-service.neozip.io` |

Production networks are also selected via CLI `-n` / connection store. On-chain contract addresses and chain IDs for tokens live in connection config and `TOKEN.NZIP` / library `CONTRACT_CONFIGS` (not in this note alone).

Paid token purchase on mainnet is **not** specified for this profile generation (`purchaseAvailable` is false until a later revision).

### 7.2 Mint flow (informative)

1. Create archive with per-entry SHA-256 extras → compute v1 Merkle root from the central directory (§6.3).
2. `neozip mint <archive>` (or `-b` / `-bm` during create) mints an NFT / token bound to that Merkle root.
3. Writer appends/updates `META-INF/TOKEN.NZIP`. If optional `manifest.json` is present, it **MAY** update `blockchain` summary and `profiles` to include `"tokenized"` for agents.

### 7.3 `TOKEN.NZIP` logical fields

Implementations store a versioned envelope. Logical fields observed / required for verification:

| Field | Description |
| :---- | :---- |
| `tokenId` | On-chain token id |
| `contractAddress` | Token contract |
| `network` / `networkChainId` | Chain identity |
| `merkleRoot` | Must match archive root from §6 |
| `transactionHash` / `blockNumber` | Mint proof |
| `owner` | Mint-time owner address |
| `creationTimestamp` | Chain / service time |
| `contractVersion` | Contract ABI/version tag |
| `encryptedHash` | Optional binding when archive is encrypted |

### 7.4 Timestamp flow (informative)

1. `-ts` / Token Service submit → `META-INF/TS-SUBMIT.NZIP` (pending).
2. `neozip upgrade` waits for confirmation → `META-INF/TIMESTAMP.NZIP`.
3. If optional `manifest.json` is present, `timestamp` summary **MAY** be updated and `profiles` may include `"timestamped"`.

OpenTimestamps (`-ots`) is an optional NeoZip CLI feature and **MAY** be advertised with a future profile flag `"ots"`.

### 7.5 Data Wallet / connection store (out of band)

Credentials (`NEOZIP_WALLET_PASSKEY`, Token Service email/token, network prefs) live in the NeoZip connection store under the user profile — **not** inside the archive. Archives carry proofs, not private keys.

---

## 8. Central directory, streaming, and first-entry rule

1. When optional `META-INF/manifest.json` is written, it **SHOULD** be the first local-file entry and first central-directory entry.
2. Catalog and verify tools **SHOULD** read the central directory (APPNOTE end-of-central-directory → central headers) and stream only needed `META-INF/**` sidecars / content digests without inflating bulk payloads when possible.
3. Self-extracting and split archives follow PKWARE; NeoZip profile metadata rules are unchanged.

---

## 9. Conformance levels

| Level | Name | Requirements |
| :---- | :---- | :---- |
| **L0** | Plain ZIP | Valid APPNOTE ZIP; no NeoZip claims |
| **L1** | NeoZip integrity | L0 + per-content `0x014E` SHA-256 extra fields + computable Merkle root (§6) |
| **L2** | NeoZip timestamped | L1 + valid `META-INF/TIMESTAMP.NZIP` bound to Merkle root |
| **L3** | NeoZip tokenized | L1 + valid `META-INF/TOKEN.NZIP` bound to Merkle root (L2 optional) |
| **+AI** | AI-aware enhanced | Any L1–L3 level **plus** `META-INF/manifest.json` for agent / LLM ingestion |

A file may advertise multiple profiles; verifiers check each independently. **+AI** is additive: it never substitutes for L1–L3 cryptographic requirements.

---

## 10. Compatibility matrix

| Consumer | Expected behavior |
| :---- | :---- |
| Info-ZIP / Finder / Explorer | Lists/extracts content; shows `META-INF/` as a folder; ignores Extra Field `0x014E`; cannot inflate Zstd (method 93) without a Zstd-capable reader |
| Java `jar` tools | Safe if `MANIFEST.MF` absent or is a valid attribute stub (§1.3); must not find JSON in `MANIFEST.MF` |
| WinZip 25+ / other APPNOTE 6.3.8+ Zstd readers | Can inflate method 93; NeoZip Extra Fields and `META-INF/*.NZIP` treated as ordinary data unless NeoZip-aware |
| NeoZip CLI (`neozip` / `neounzip` / `neolist`) | Full L1–L3 verify from Extra Fields + `*.NZIP` sidecars; Zstd; AES-256; mint/stamp without requiring `manifest.json` |
| AI / automation agents | Prefer optional `META-INF/manifest.json` when present (**+AI**); otherwise fall back to CLI JSON / schema interfaces for operations |

---

## 11. Versioning of this note

- **Minor** (0.x → 0.y): additive fields, new optional `META-INF/` entries, new reserved Extra Field IDs, additive AI-aware fields.
- **Major** (1.0+): breaking rename of required paths or merkle algorithm.

When present, archives may declare `specVersion` in `META-INF/manifest.json` for AI-aware consumers. Readers **SHOULD** best-effort older versions rather than refuse. Absence of `manifest.json` does not lower L1–L3 validity.

---

## 12. Open items (draft)

1. Publish formal JSON Schema for `META-INF/manifest.json`, `TOKEN.NZIP`, and `TIMESTAMP.NZIP`.
2. Decide whether to always emit the optional Java `MANIFEST.MF` stub.
3. Register additional Extra Field IDs with PKWARE only after the entry-name convention proves itself in the field.
4. Optional later merkle algorithm: bind normalized path into leaf digests for single-file inclusion proofs (explicit new algorithm id; not a silent change to v1).
5. Future AI-aware enhancements: deeper semantic content indexes, agent instruction fields, and related extensions in `manifest.json` without requiring changes to token/timestamp verification.

---

## 13. Change log

| Date | Version | Change |
| :---- | :---- | :---- |
| 2026-08-03 | 0.1.0 | §4.2: NeoEncrypt (`0x024E` + real compression method) is NeoZip default AES-256; WinZip AES (method **99** + **`0x9901`**) is recognized for interop, not default write. |
| 2026-08-03 | 0.1.0 | Initial release. |
