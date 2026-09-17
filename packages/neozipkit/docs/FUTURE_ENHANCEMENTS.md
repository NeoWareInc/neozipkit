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
SHA-256, Zstd method 93 on Node.

---

## E1 — Complete Zip64 read and write (priority 1)

**Why first.** Archives past **65,535 members** or **4 GiB − 1** of size/offset
are not valid classic ZIP. The APPNOTE already defers Zip64 layouts to PKWARE.
Until this is complete, those archives cannot be produced here and cannot be
extracted reliably.

**What exists today**

- Constants for Zip64 EOCD (`0x06064b50`), locator (`0x07064b50`), and extra
  `0x0001` (`HDR_ID.ZIP64`) in `src/core/constants/Headers.ts`.
- **Partial read:** `Zipkit` / `ZipkitNode.loadZIP64EOCD` only if the classic
  EOCD **central-directory offset** is `0xFFFFFFFF`. They then take CD size and
  CD offset from a 56-byte Zip64 EOCD. They do **not** consult Zip64 when
  entry count is `0xFFFF` or CD size is `0xFFFFFFFF`.
- Extra `0x0001` is **logged** in verbose listing (`ZipEntry`); it is **not**
  applied to `uncompressedSize`, `compressedSize`, or `localHdrOffset`.
  `readZipEntry` still uses the classic u32 fields (`0xFFFFFFFF` stays as the
  size).
- **No write path.** `centralEndHdrMethod`, `writeEndOfCentralDirectory`,
  `ZipEntry` local/central headers, and `ZipCopy` / `ZipCopyNode` always emit
  u16 counts and u32 sizes/offsets. `writeUInt16LE` / `writeUInt32LE` throw
  once those limits are exceeded. Extra `0x0001` is never written.
- **No Zip64 tests** under `tests/`.

**Done when**

1. **Write** (Node streaming + buffer/`ZipkitBrowser` + copy): if uncompressed
   size, compressed size, local-header offset, CD size, CD offset, or total
   entries overflows the classic field, emit:
   - Extra Field **`0x0001`** on that member (only overflowing fields, APPNOTE
     order: uncompressed size, compressed size, relative header offset, disk
     start number).
   - **Zip64 EOCD** (`0x06064b50`) with u64 counts/sizes/offsets.
   - **Zip64 locator** (`0x07064b50`) immediately before the classic EOCD.
   - Classic EOCD still present, with `0xFFFF` / `0xFFFFFFFF` in overflowed
     fields. Version-needed **45** on Zip64 members.
2. **Read:** after the classic EOCD, if **any** of offset, CD size, or entry
   counts is a Zip64 sentinel, parse locator then Zip64 EOCD (including
   `TOTAL_ENTRIES`). When a member’s size or local offset is `0xFFFFFFFF` /
   `0xFFFF`, merge extra `0x0001` into `ZipEntry` before inflate/extract.
   Keep values past 4 GiB (`number` is enough through 2⁵³ − 1; use `bigint`
   if offsets can exceed that — today’s `Number(readBigUInt64LE)` is not).
3. **Tests:** round-trip (a) uncompressed size ≥ 4 GiB (stored sparse/synthetic),
   (b) ≥ 65,536 empty members, (c) CD offset ≥ 4 GiB. Info-ZIP / Python
   `zipfile` Zip64 can list the file; this kit lists and extracts one member.
   Classic archives (no Zip64 records) still parse unchanged. Cover Node
   streaming, `Zipkit.loadZip` buffer, browser, and copy.
4. **Copy** (`ZipCopy` / `ZipCopyNode`) preserves extra `0x0001` and rewrites
   Zip64 EOCD/locator for the new offsets.

**Out of scope for E1:** spanned/split disks, Zip64 extensible data sector
beyond the required record.

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

## E4 — Optional AI-aware `META-INF/manifest.json` writer

[WHATS_NEW.md](../WHATS_NEW.md) (1.0.5): the kit aligns with APPNOTE wire
foundations and Merkle; optional AI-aware `manifest.json` is still
forthcoming. ZipWiki writes that file; this package only needs to **preserve**
it on copy and **discover** it case-insensitively (already done).

**Done when (if the kit owns create):** an opt-in helper to emit a minimal
valid `manifest.json` (`format`, `specVersion`, `createdAt`) without pulling
in ZipWiki parse/OKF.

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
| **E1** | **Complete Zip64 read + write** | — |
| E2 | Browser Zstd | — |
| E3 | META-INF JSON Schema | — |
| E4 | Optional manifest writer | — |
| E5 | Path-bound Merkle | — |
| E6 | Split/spanned | — |

Ship **E1** before promising archives that exceed classic ZIP limits.
