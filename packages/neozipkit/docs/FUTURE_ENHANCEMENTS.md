# NeoZipKit — future enhancements

Backlog for the **`neozipkit`** ZIP codec (create, list, extract, Extra Fields).
Blockchain mint/stamp and recipient `ACCESS.NZIP` live in
[`neozip-blockchain`](../../neozip-blockchain/). Wire profile:
[NEOZIP_APPNOTE.md](../NEOZIP_APPNOTE.md). PKWARE layouts:
[APPNOTE.txt](./APPNOTE.txt).

Ids (`E1` …) are stable. Do not renumber; insert with a letter (`E1a`) if needed.

**Already in this package (not listed below):** streaming Node create/extract
(~512 KiB chunks), UTF-8 language encoding flag (bit 11) plus Unicode Path extra,
NeoEncrypt (`0x024E`) and WinZip AES (method 99 / `0x9901`), ZipCrypto, data
descriptors on copy/crypto, Info-ZIP UT extra (`0x5455`), Extra Field `0x014E`
SHA-256, Zstd method 93 on Node, **Zip64 Version 1** (read + Node write for
size/offset; buffer entry-count Zip64 — see E1).

---

## E1 — Complete Zip64 read and write ✅

**Status:** Done (APPNOTE Zip64 Version 1).

- Shared helpers: `src/core/zip64/Zip64.ts`
- **Read:** any classic EOCD sentinel → locator → Zip64 EOCD; merge extra `0x0001` into `ZipEntry`; Zip64 data-descriptor length on copy
- **Write (Node):** local/central `0x0001`, version-needed 45, Zip64 EOCD + locator, local size patch into Zip64 extra
- **Write (buffer/browser):** Zip64 for entry count > 65 535 only; size/offset ≥ 4 GiB throws and directs callers to Node streaming
- **Copy:** `ZipCopyNode` rewrites Zip64 EOCD/locator; buffer `ZipCopy` refuses multi-GiB materialization
- **Tests:** `tests/unit/core/zip64/Zip64.test.ts` (includes `forceZip64`)
- **Force for testing:** `CompressOptions.forceZip64` / `buildZipBufferSync(..., { forceZip64: true })`; smoke: `pnpm test:zip64`

**Out of scope (unchanged):** spanned/split disks (E6), Zip64 EOCD extensible sector.

**Spec:** APPNOTE.txt §4.3.14–4.3.16, §4.4.16–4.4.24, §4.5.3.

---

## E2 — Browser Zstd (method 93)

Node uses native `zlib` Transform streams. The browser codec throws if
`useZstd` is set; Deflate/Stored only.

**Done when:** optional browser Zstd inflate/deflate (WASM or platform API)
with the same method 93 frames as Node, or a documented hard error that
points users at Node for Zstd archives. Do not reintroduce the old
`@oneidentity/zstd-js` heap-queue path ([FINAL_STATUS.md](./FINAL_STATUS.md)).

---

## E3 — JSON Schema for reserved `META-INF/` JSON

APPNOTE §12 open item 1: formal schemas for `manifest.json`, `TOKEN.NZIP`,
`TIMESTAMP.NZIP`, and `ACCESS.NZIP` (the last is written by
`neozip-blockchain`).

**Done when:** schemas live next to the APPNOTE, and readers can validate
without guessing field names.

---

## E4 — Optional AI-aware `META-INF/manifest.json` writer ✅ (minimal)

**Status:** Done for the **minimal** APPNOTE body. Full AI/OKF detail remains
ZipWiki-owned.

- Helpers: `buildMinimalZipWikiManifest` / `serializeZipWikiManifest`
  (`src/node/zipwiki/ZipWikiWriter.ts`)
- Emits `format`, `specVersion`, `createdAt`, `profiles`; optional empty `ai`
  block (`includeAi`) for ZipWiki-shaped packages
- ZipWiki still writes the full AI manifest at pack time; this package
  **preserves** it on copy and **discovers** it case-insensitively (already done)

**Out of scope:** parse/OKF fields, `ai.primaries[]` population, Merkle digest
computation — ZipWiki (or a later E4b) owns those.

---

## E4a — ZipWiki-compatible ZipkitNode writer ✅

**Status:** Done on `dev` (unreleased until the next kit publish).

ZipWiki pack frames ZIPs in its own `writeZipBuffer`. NeoZipKit now mirrors
that container shape so ZipWiki can swap writers later:

- `writeZipWikiBufferSync` / `writeZipWikiFileSync` /
  `ZipkitNode.writeZipWikiMembersSync`
- CD order META-INF → `{aiRoot}/` → primaries (`sortZipWikiMembers`)
- Origin locator → Extra Field `0x014F`; optional global `0x014E`
- Store-by-suffix defaults matching ZipWiki binaries
- Tests: `tests/unit/node/ZipWikiWriter.test.ts`
- Example: `examples/create-zipwiki.ts`

**Still ZipWiki-only:** LlamaParse/LiteParse, OKF generation, full AI manifest.

---

## E5 — Path-bound Merkle algorithm (new id)

APPNOTE §12 item 4: a later algorithm that binds normalized path into leaf
digests for single-file inclusion proofs. Must not silently change v1.

**Done when:** a new `algorithm` id, tests against v1/v0, and APPNOTE text
before any on-chain use.

---

## E6 — Split / spanned archives

Multi-disk ZIP (`disk number` ≠ 0, spanning signatures). Single-file `.nzip`
does not need this.

**Done when (if ever):** reject with a clear error rather than mis-parsing;
full spanning is optional and low priority.

---

## Order

| Id | Enhancement | Depends on |
| :---- | :---- | :---- |
| E1 | Zip64 read + write | **Done** |
| E2 | Browser Zstd | — |
| E3 | META-INF JSON Schema | — |
| E4 | Minimal manifest writer | **Done** |
| E4a | ZipWiki-compatible writer | **Done** (`dev`) |
| E5 | Path-bound Merkle | — |
| E6 | Split/spanned | — |
