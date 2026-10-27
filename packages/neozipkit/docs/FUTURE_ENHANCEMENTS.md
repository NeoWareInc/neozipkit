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

- Helpers (`buildMinimalZipWikiManifest` / `serializeZipWikiManifest`) were
  **removed from the public API in 1.6.0**; `examples/create-zipwiki.ts` inlines
  a minimal manifest builder instead
- Minimal body: `format`, `specVersion`, `createdAt`, `profiles`; optional empty
  `ai` block
- ZipWiki still writes the full AI manifest at pack time; this package
  **preserves** it on copy and **discovers** it case-insensitively (already done)

**Out of scope:** parse/OKF fields, `ai.primaries[]` population, Merkle digest
computation — ZipWiki (or a later E4b) owns those.

---

## E4a — ZipWiki-shaped writer helpers ❌ (removed in 1.6.0)

**Status:** Removed. `writeZipWiki*`, `ZipkitNode.writeZipWikiMembersSync`, and
the `src/node/zipwiki/` module are gone from the public API. Prefer **E7**
(general ZipkitNode hooks) over any ZipWiki-named kit API.

The same ZIP frame is reachable with `buildZipBufferSync` / `writeZipFileSync` /
`writeMembersSync` plus `0x014F` (`makeOriginExtra`) and `0x014E`.
`examples/create-zipwiki.ts` shows the pattern with local helpers. Product rules
(CD order, store-by-suffix, full AI manifest, parse, OKF) stay in **ZipWiki**.

---

## E7 — General ZipkitNode extension hooks (for ZipWiki and others)

**Status:** Backlog — preferred path for future ZipWiki (and similar) integration.

NeoZipKit should stay a ZIP codec with clear extension points so apps like
ZipWiki compose product behavior **on top of** ZipkitNode, without baking
app-specific writers into the kit. Candidates (refine when integrating):

- Stable member write model: `additionalExtra`, `useSHA256`, `precompressed`,
  method/level, Zip64 — already largely there; document as the integration
  contract
- Optional **entry transform / filter hooks** on create and copy (reorder,
  inject META-INF, drop/replace members) without forking the writer
- Optional **extra-field registry / builders** (compose multiple caller blocks
  beside `0x014E` / crypto extras) so apps do not hand-concatenate TLV
- Clear **read** hooks: list with extras preserved, stream verified payloads,
  origin/`0x014F` parse already exported — keep that pattern for new fields
- Avoid ZipWiki-/AI-specific types in public kit APIs; keep those in ZipWiki
  (or a thin adapter in the ZipWiki repo)

**Done when:** ZipWiki (or another app) can replace its hand-rolled ZIP frame
using documented ZipkitNode primitives + hooks, with little or no
kit-side ZipWiki-named surface.

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
| E4 | Minimal manifest writer | **Done** (optional) |
| E4a | ZipWiki-shaped helpers | **Removed** in 1.6.0 (prefer E7) |
| E5 | Path-bound Merkle | — |
| E6 | Split/spanned | — |
| E7 | General ZipkitNode hooks | Preferred for ZipWiki-class apps |
