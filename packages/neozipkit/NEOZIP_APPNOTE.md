# NeoZip Application Note

**Format:** `.nzip` (ZIP profile)  
**Version:** 0.1.0-draft  
**Status:** Draft — extends PKWARE APPNOTE 6.3.10  
**Date:** 2026-08-02  
**Base specification:** PKWARE [APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) (`.ZIP` File Format Specification, Version 6.3.10)  
**Scope:** Compression, encryption, integrity, and blockchain / Token Service extensions used by NeoZip (NeoZipKit, NeoZip CLI, and companions). AI/knowledge-bundle (ZipCodex) conventions are out of scope for this distribution note.

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
| Structured metadata | Integrity digests, merkle roots, and blockchain summaries need structured fields. JSON (or CBOR later) is the right carrier; attribute-list MF is not. |

### 1.3 Recommendation (normative for this profile)

1. **Use the directory `META-INF/`** for all NeoZip sidecars. Do not invent a parallel `METADATA/` tree.
2. **Primary NeoZip discovery file:** `META-INF/manifest.json`  
   - UTF-8 JSON.  
   - **SHOULD** be the **first** ZIP entry (APPNOTE §4.1.11 / §4.7.2).  
   - **MAY** be STORED or Deflate/Zstd-compressed; STORED is **RECOMMENDED** so tools can stream it without inflate.
3. **Do not put JSON in `META-INF/MANIFEST.MF`.** Leave that name for optional Java-compatible stubs only.
4. **Optional bridge file** `META-INF/MANIFEST.MF` (Java attribute syntax) **MAY** be written as a thin pointer for JAR-aware tools:

   ```
   Manifest-Version: 1.0
   NeoZip-Specification-Version: 0.1
   NeoZip-Manifest: META-INF/manifest.json
   Created-By: NeoZip/1.0
   ```

   Consumers that understand NeoZip **MUST** prefer `META-INF/manifest.json` over `MANIFEST.MF`.
5. **Discovery rule for NeoZip-aware tools:**  
   If a ZIP contains `META-INF/manifest.json` with `"format": "neozip"`, treat the archive as NeoZip-profiled and follow §3–§7 of this note.  
   Absence of that file means a plain ZIP (or JAR / other profile).

---

## 2. Archive layout (v0)

### 2.1 Minimal NeoZip archive (integrity only)

```
hello.txt.nzip
  META-INF/manifest.json          # first entry; integrity discovery
  hello.txt                       # original payload (any relative path allowed)
```

Per-file SHA-256 **SHOULD** also appear in the Extra Field `0x014E` on each local/central header (§5).

### 2.2 Blockchain / Token Service sidecars

When present, these **MUST** live under `META-INF/`:

| Entry | When written | Purpose |
| :---- | :---- | :---- |
| `META-INF/TOKEN.NZIP` | After successful mint (`neozip mint` / `-b`) | On-chain token binding (tokenId, contract, tx, merkleRoot, …) |
| `META-INF/TIMESTAMP.NZIP` | After confirmed Token Service stamp (`-ts` / `upgrade`) | Timestamp proof metadata |
| `META-INF/TS-SUBMIT.NZIP` | After stamp submit, before confirm | Pending timestamp submission |

Alternate token entry recognized by NeoZip: `META-INF/NZIP.TOKEN` (legacy, also uppercase).  
Writers **MUST** emit the canonical uppercase forms above. NeoZip-aware readers (including NeoZip CLI) **MUST** discover these reserved paths with **ASCII case-insensitive** comparison (see §2.3), so `META-INF/token.nzip` is accepted for discovery; writers must still not emit that spelling.

These files are NeoZip application payloads (JSON or versioned binary envelopes as implemented by NeoZip). Generic unzip tools treat them as ordinary files under `META-INF/` and typically do not present them as “the” content of the archive.

### 2.3 Path case rules (reserved meta names)

ZIP stores entry names as opaque byte strings (case-preserving). This profile separates **what writers emit** from **what readers accept**.

**Canonical forms (writers MUST emit exactly these spellings):**

| Role | Canonical path |
| :---- | :---- |
| Directory | `META-INF/` (uppercase, JAR/APPNOTE convention) |
| NeoZip discovery | `META-INF/manifest.json` |
| Token / timestamp | `META-INF/TOKEN.NZIP`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP` |

**Reader lookup for reserved meta paths (NeoZip-aware tools MUST):**

1. Match the reserved prefixes and filenames with **ASCII case-insensitive** comparison  
   (`META-INF/manifest.json` ≡ `meta-inf/Manifest.JSON` ≡ `META-INF/MANIFEST.JSON` for *discovery*).  
   The same rule applies to `TOKEN.NZIP`, `NZIP.TOKEN`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP`, and the OTS equivalents.
2. Prefer an exact canonical match when both a canonical and a differently cased duplicate exist.
3. **MUST NOT** treat two reserved meta entries that differ only by case as two different resources; that archive is malformed — fail or keep the canonical spelling’s entry.
4. Paths **inside** content payloads (the original document’s own name) stay as stored; case folding applies only to reserved `META-INF/**` profile entries, not to arbitrary archive members.
5. Paths recorded *inside* `manifest.json` bodies **SHOULD** use canonical casing when written; readers resolving those pointers **MUST** also try ASCII case-insensitive match within the ZIP central directory.

**Why writers stay strict:** one spelling keeps central-directory scans trivial, matches NeoZip’s emitted uppercase token files, and prevents duplicate leaf names that break Windows extraction.

**Why readers fold:** Windows unzip and some GUI tools fold case on extract/repack; hand-edited or round-tripped archives may alter spelling. Case-insensitive *discovery* avoids silent “not tokenized / not stamped” misses while keeping writer output deterministic.

### 2.4 Root entry rules

1. All token and timestamp data **MUST** be under `META-INF/`.
2. Content payloads are every ZIP entry outside `META-INF/`; when `manifest.json` is present they **SHOULD** be listed in `manifest.json` `content[]`.
3. A general NeoZip archive **MAY** contain many content entries without blockchain sidecars.

---

## 3. `META-INF/manifest.json` schema (v0)

UTF-8 JSON object. Unknown keys **MUST** be preserved on round-trip by NeoZip-aware writers when possible; unknown keys **MUST NOT** cause readers to reject the archive.

### 3.1 Required fields

| Field | Type | Description |
| :---- | :---- | :---- |
| `format` | string | `"neozip"` |
| `specVersion` | string | This note’s version, e.g. `"0.1.0"` |
| `createdAt` | string | ISO-8601 creation time |

### 3.2 Recommended fields

| Field | Type | Description |
| :---- | :---- | :---- |
| `content` | array | Content entries (non-`META-INF/` files). Each: `{ "path", "sha256", "size", "mimeType?" }` |
| `merkleRoot` | string | Hex SHA-256 merkle root over content leaf hashes — see §6 |
| `profiles` | string[] | Declared profiles, e.g. `["integrity"]`, `["tokenized"]`, `["timestamped"]` |
| `blockchain` | object | Token / network summary when tokenized (full proof remains in `TOKEN.NZIP`) |
| `timestamp` | object | Stamp summary when stamped (full proof in `TIMESTAMP.NZIP`) |
| `compression` | object | Defaults: `{ "method": "zstd" \| "deflate" \| "store", "level"?: number }` |
| `encryption` | object | `{ "method": "none" \| "aes-256" \| "pkzip" }` |

### 3.3 Example (integrity + compression, not tokenized)

```json
{
  "format": "neozip",
  "specVersion": "0.1.0",
  "createdAt": "2026-08-02T12:00:00Z",
  "profiles": ["integrity"],
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

### 3.4 Example (tokenized summary fields)

```json
{
  "format": "neozip",
  "specVersion": "0.1.0",
  "createdAt": "2026-08-02T12:00:00Z",
  "profiles": ["integrity", "tokenized", "timestamped"],
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

Full on-chain and Token Service proofs remain in `META-INF/TOKEN.NZIP` / `TIMESTAMP.NZIP`; `manifest.json` holds discovery summaries only.

---

## 4. Compression and encryption

### 4.1 Compression methods

| Method | APPNOTE method ID | NeoZip default | Notes |
| :---- | :---- | :---- | :---- |
| Store | 0 | optional (`-0`) | Required for selective-read of small metadata when desired |
| Deflate | 8 | via `--deflate` / `--legacy` | Info-ZIP compatible path |
| Zstd | **93** | **default** | Official PKWARE APPNOTE 6.3.8+ assignment (method 20 deprecated). Readable by Zstd-aware ZIP tools (e.g. WinZip 25+). Stock Info-ZIP `unzip` generally cannot; use `--legacy` / Deflate for that path. |

Writers using Zstd **MUST** set general-purpose flags and version-needed fields consistently with NeoZip implementation practice, and **SHOULD** document the method in `manifest.json` `compression.method`.

Readers that do not understand method 93 **MUST** report a clear unsupported-method error (not silent data loss).

**Legacy interoperability:** `neozip --legacy` forces Deflate (or Store at `-0`) and disables NeoZip extensions (Zstd, blockchain `-b`/`-bd`/`-bm`, `-ots`, `-ts`) so stock Info-ZIP `unzip` can read the archive.

### 4.2 Encryption

| Method | Flag / option | Notes |
| :---- | :---- | :---- |
| None | default for many workflows | Allowed |
| AES-256 | `-e` / `--aes256` | NeoZip strong default for confidential archives |
| Traditional PKZIP | `--pkzip` | Legacy interoperability only |

Encryption of `META-INF/manifest.json` is **DISCOURAGED** when discovery matters (tools cannot find digests/proofs). Prefer encrypting content entries while leaving `META-INF/manifest.json` and public proofs readable, unless the entire archive is confidential.

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
- For the archive merkle root (§6), leaf hashes **SHOULD** be these per-entry digests (content entries at minimum).
- Unknown Extra Fields: APPNOTE requires readers to skip; NeoZip-unaware tools remain compatible.

### 5.3 Reserved NeoZip Extra Field space

For future registration / local use (not yet assigned in this draft):

| ID | Status | Intended use |
| :---- | :---- | :---- |
| `0x014E` | **Assigned** | Per-entry SHA-256 |
| `0x014F`–`0x0153` | Reserved (NeoZip) | Merkle / profile hints (TBD; prefer `manifest.json` first) |

Third-party IDs **MUST** follow APPNOTE §4.6 (do not collide with PKWARE 0x0001–0x0065 and published third-party IDs).

---

## 6. Merkle root and integrity

### 6.1 Purpose

Provide a single digest for the archive’s protected content so Token Service timestamps and blockchain tokens bind to **bytes**, not filenames alone.

### 6.2 v0 algorithm (content leaves)

1. Collect each **content** entry listed in `manifest.json` `content[]` (exclude `META-INF/**` unless a future profile opts in).
2. For each entry, take SHA-256 of uncompressed bytes (= Extra Field `0x014E` value when present).
3. Sort leaves by `path` (UTF-8 byte order).
4. Build a binary merkle tree with SHA-256. **Odd-leaf rule (locked):** when a level has an odd count, **duplicate the last leaf** before pairing (Bitcoin-style).
5. Store hex root in `manifest.json` `merkleRoot` and in token/timestamp payloads.

For a single content entry, `merkleRoot` **MAY** equal that entry’s SHA-256 (single-leaf tree).

### 6.3 Verification

- `neounzip -T` / `--pre-verify`: recompute leaf hashes, rebuild root, compare to `merkleRoot` and on-chain / Token Service records when present.
- Mismatch **MUST** fail verification; extract **MAY** still proceed only with an explicit override (`--skip-blockchain`).

---

## 7. Blockchain and Token Service

### 7.1 Networks

NeoZip CLI defaults to `base-sepolia` for development; production networks are selected via `-n` / connection store. This note does not hard-code chain IDs — they live in connection config and `TOKEN.NZIP`.

### 7.2 Mint flow (informative)

1. Create archive with per-entry SHA-256 extras → `merkleRoot`.
2. `neozip mint <archive>` (or `-b` / `-bm` during create) mints an NFT / token bound to `merkleRoot`.
3. Writer appends/updates `META-INF/TOKEN.NZIP` and updates `manifest.json` `blockchain` summary + `profiles` to include `"tokenized"`.

### 7.3 `TOKEN.NZIP` logical fields

Implementations store a versioned envelope. Logical fields observed / required for verification:

| Field | Description |
| :---- | :---- |
| `tokenId` | On-chain token id |
| `contractAddress` | Token contract |
| `network` / `networkChainId` | Chain identity |
| `merkleRoot` | Must match archive |
| `transactionHash` / `blockNumber` | Mint proof |
| `owner` | Mint-time owner address |
| `creationTimestamp` | Chain / service time |
| `contractVersion` | Contract ABI/version tag |
| `encryptedHash` | Optional binding when archive is encrypted |

### 7.4 Timestamp flow (informative)

1. `-ts` / Token Service submit → `META-INF/TS-SUBMIT.NZIP` (pending).
2. `neozip upgrade` waits for confirmation → `META-INF/TIMESTAMP.NZIP`.
3. `manifest.json` `timestamp` summary updated; `profiles` may include `"timestamped"`.

OpenTimestamps (`-ots`) is an optional NeoZip CLI feature and **MAY** be advertised with a future profile flag `"ots"`.

### 7.5 Data Wallet / connection store (out of band)

Credentials (`NEOZIP_WALLET_PASSKEY`, Token Service email/token, network prefs) live in the NeoZip connection store under the user profile — **not** inside the archive. Archives carry proofs, not private keys.

---

## 8. Central directory, streaming, and first-entry rule

1. `META-INF/manifest.json` **SHOULD** be the first local-file entry and first central-directory entry.
2. Catalog and verify tools **SHOULD** read the central directory (APPNOTE end-of-central-directory → central headers) and stream only needed `META-INF/**` entries without inflating content payloads when possible.
3. Self-extracting and split archives follow PKWARE; NeoZip profile metadata rules are unchanged.

---

## 9. Conformance levels

| Level | Name | Requirements |
| :---- | :---- | :---- |
| L0 | Plain ZIP | Valid APPNOTE ZIP; no NeoZip claims |
| L1 | NeoZip integrity | L0 + `META-INF/manifest.json` + per-content `0x014E` SHA-256 + `merkleRoot` |
| L2 | NeoZip timestamped | L1 + valid `META-INF/TIMESTAMP.NZIP` bound to `merkleRoot` |
| L3 | NeoZip tokenized | L1 + valid `META-INF/TOKEN.NZIP` bound to `merkleRoot` (L2 optional) |

A file may advertise multiple profiles; verifiers check each independently.

---

## 10. Compatibility matrix

| Consumer | Expected behavior |
| :---- | :---- |
| Info-ZIP / Finder / Explorer | Lists/extracts content; shows `META-INF/` as a folder; ignores Extra Field `0x014E`; cannot inflate Zstd (method 93) without a Zstd-capable reader |
| Java `jar` tools | Safe if `MANIFEST.MF` absent or is a valid attribute stub (§1.3); must not find JSON in `MANIFEST.MF` |
| WinZip 25+ / other APPNOTE 6.3.8+ Zstd readers | Can inflate method 93; NeoZip Extra Fields and `META-INF/*.NZIP` treated as ordinary data unless NeoZip-aware |
| NeoZip CLI (`neozip` / `neounzip` / `neolist`) | Full L1–L3 verify, Zstd, AES-256, mint/stamp |
| AI / automation agents | Prefer `META-INF/manifest.json`; use `neozip schema` / `--format json` when invoking CLI |

---

## 11. Versioning of this note

- **Minor** (0.x → 0.y): additive fields, new optional `META-INF/` entries, new reserved Extra Field IDs.
- **Major** (1.0+): breaking rename of required paths or merkle algorithm.

Archives declare `specVersion` in `META-INF/manifest.json`. Readers **SHOULD** best-effort older versions rather than refuse.

---

## 12. Open items (draft)

1. Align merkle odd-leaf rule with NeoZip sources if they diverge from duplicate-last (§6.2).
2. Publish formal JSON Schema for `META-INF/manifest.json`, `TOKEN.NZIP`, and `TIMESTAMP.NZIP`.
3. Decide whether to always emit the optional Java `MANIFEST.MF` stub.
4. Register additional Extra Field IDs with PKWARE only after the entry-name convention proves itself in the field.

---

## 13. Change log

| Date | Version | Change |
| :---- | :---- | :---- |
| 2026-08-02 | 0.1.0-draft | Packaged with NeoZipKit npm distribution (same note as NeoZip CLI).
| 2026-08-02 | 0.1.0-draft | §2.2–§2.3: reserved meta-path discovery is ASCII case-insensitive (**MUST** for NeoZip-aware readers); writers remain strict on canonical spellings. |
| 2026-08-02 | 0.1.0-draft | §4.1: Zstd method 93 documented as official PKWARE APPNOTE 6.3.8+ (not a NeoZip assignment); compatibility matrix and open items updated. |
| 2026-08-02 | 0.1.0-draft | NeoZip CLI distribution subset: compression, encryption, integrity, blockchain / Token Service only (ZipCodex material omitted). |
| 2026-07-31 | 0.1.0-draft | Initial NeoZip profile draft (upstream): `META-INF/manifest.json`, Extra Field `0x014E`, merkle/token/timestamp sidecars, `.nzip` naming. |
