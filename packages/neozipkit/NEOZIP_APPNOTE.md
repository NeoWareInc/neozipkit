# NeoZip Application Note

| | |
| :---- | :---- |
| **Format** | `.nzip` (ZIP profile) |
| **Specification version** | **0.2.0-draft** |
| **Status** | Draft — extends PKWARE APPNOTE 6.3.10 |
| **Document date** | 2026-09-02 |
| **Canonical publication** | [https://neozip.io/spec/appnote](https://neozip.io/spec/appnote) |
| **Version history (web)** | [https://neozip.io/spec/appnote/history](https://neozip.io/spec/appnote/history) |
| **Base specification** | [APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) (PKWARE `.ZIP` File Format Specification, Version 6.3.10) |
| **Related** | [ZIPWIKI_APPNOTE.md](https://github.com/NeoWareInc/format-specs/blob/main/ZIPWIKI_APPNOTE.md) (ZipWiki AI / `wiki/` extensions) · [OKF_SPEC.md](https://github.com/NeoWareInc/format-specs/blob/main/OKF_SPEC.md) · [OKF_ZIPWIKI_VS_SPEC.md](https://github.com/NeoWareInc/format-specs/blob/main/OKF_ZIPWIKI_VS_SPEC.md) |

This file in the repository is the working draft. When a release is published,
**https://neozip.io/spec/appnote** is the normative location for the current
revision; earlier revisions and the full change log are linked from
**https://neozip.io/spec/appnote/history**. When `META-INF/manifest.json` is
present, it declares the specification version via `specVersion`.

---

## 0. Purpose and relationship to PKWARE APPNOTE

This document defines the **NeoZip profile** of the ZIP format: a compatible ZIP
container with integrity extras, optional blockchain and recipient-access
sidecars, and optional AI / knowledge payloads (ZipWiki).

1. Every `.nzip` file **MUST** be a valid ZIP per PKWARE APPNOTE 6.3.10.
2. This profile **adds** entry-name conventions, Extra Field IDs, compression
   method usage, optional reserved top-level AI roots, and an optional advanced
   features manifest (`META-INF/manifest.json`).
3. Features not present in a given archive are simply absent. Readers
   **MUST** ignore unknown Extra Fields and unknown reserved meta entries
   (APPNOTE §4.5 / §4.6).
4. Normative PKWARE record layouts are defined in [APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

Where this document conflicts with PKWARE on wire layout, **PKWARE wins**. Where
this document defines NeoZip-only conventions, this document wins for
NeoZip-aware tools.

**Integrity, minting, timestamping, and recipient decryption do not require
`META-INF/manifest.json`.** They rely on the central directory, Extra Field
`0x014E`, and optional `META-INF/*.NZIP` sidecars (§7–§9). Recipient decryption
uses `ACCESS.NZIP` plus content-entry AES (§9.3) and likewise **MUST NOT**
require `manifest.json`. The manifest is an optional structured control surface
for **advanced package features** (§2) — AI / ZipWiki discovery is one consumer,
not the only one.

This note is only the **on-wire** contract for a single `.nzip` package.
Product architecture (ingest phases, UI) is out of scope. ZipWiki writer
conventions (`.zipwiki` filename, stage tree, omit-original extension set,
collision rewrite, extra parser fields) live in
[ZIPWIKI_APPNOTE.md](https://github.com/NeoWareInc/format-specs/blob/main/ZIPWIKI_APPNOTE.md).

---

## 1. Two reserved namespaces

### 1.1 `META-INF/` — package metadata

`META-INF/` holds optional package control and blockchain / access metadata:

| Entry | Role |
| :---- | :---- |
| `META-INF/manifest.json` | Advanced features manifest (§2, §4) — required when package AI materials are present (§1.2, L4); **MAY** be used for other advanced discovery without AI |
| `META-INF/TOKEN.NZIP` | On-chain token binding (optional) |
| `META-INF/TIMESTAMP.NZIP` | Confirmed timestamp proof (optional) |
| `META-INF/TS-SUBMIT.NZIP` | Pending timestamp submit (optional) |
| `META-INF/ACCESS.NZIP` | Recipient / hybrid encryption sidecar (optional; §9.3) |

Future blockchain or integrity sidecars **MAY** also use `META-INF/` when
registered in a later revision of this note.

**NeoZip discovery (any one is enough):** Extra Field `0x014E` on content
entries; or `META-INF/TOKEN.NZIP` / `TIMESTAMP.NZIP` / `TS-SUBMIT.NZIP`; or
`META-INF/ACCESS.NZIP` (§9.3); or `META-INF/manifest.json` with
`"format": "neozip"`. Absence of all of these means a plain ZIP (or another
profile).

### 1.2 AI root — package AI namespace

ZipWiki and agent materials live under a **single top-level AI root directory**
named by the writer and declared in the manifest (`ai.root`). When any material
under an AI root is present, `META-INF/manifest.json` **MUST** be present and
include a valid `ai` object (§4.3). ZipWiki packing details for this tree are
in [ZIPWIKI_APPNOTE.md](https://github.com/NeoWareInc/format-specs/blob/main/ZIPWIKI_APPNOTE.md). Recommended roots:

| Directory | Recommendation |
| :---- | :---- |
| **`wiki/`** | **ZipWiki standard layout** (default for `"zipwiki"` profile) — parse + OKF as a readable wiki tree |
| **`ai/`** | Shortest and universal |
| **`context/`** | Aligns with LLM engineering (“context window”, “retrieval context”) |

Writers **MUST** use exactly one of these roots (or another root only if a future
profile documents it). Mixing multiple AI roots in one package is **invalid**.

**Layout under the AI root** (example uses `wiki/`):

```
archive.nzip
├── META-INF/
│   ├── manifest.json              # Advanced features manifest (when needed)
│   └── TOKEN.NZIP                 # Blockchain metadata (optional)
├── document.pdf                   # Primary content (MAY be omitted when parsed — §3.2)
├── notes.docx                     # Primary without parse still belongs at zip root
└── wiki/                          # AI root (ai.root)
    ├── okf/                       # Optional Open Knowledge Format tree (§6)
    │   ├── index.md               # Bundle listing + okf_version (ZipWiki SHOULD emit)
    │   ├── document.md            # Concept for document.pdf (stem = primary basename)
    │   └── notes.md               # Concept for notes.docx (even when parse is missing)
    └── parsed/                    # Optional parsed text per primary
        ├── document.pdf.md
        └── document.pdf.assets/
            └── image_1.png
```

ZipWiki producers emit **one OKF concept file per primary** under `{R}/okf/{stem}.md`
(stem = primary basename without extension), plus optional `index.md`. A legacy
package-level `document.md` alone is still valid OKF, but new writers **SHOULD**
prefer per-primary concepts. OKF **MAY** be omitted entirely (`ai.okf` absent /
`present: false`) while still shipping `parsed/` (and vice versa).

Layouts with `ai/` or `context/` match this structure except for the
top-level directory name.

### 1.3 Path case rules

**Writers MUST** emit:

- `META-INF/` (uppercase) whenever any reserved meta entry is written
- `META-INF/manifest.json` when package AI materials are present, or when the
  writer chooses to emit advanced feature discovery (§2)
- Uppercase blockchain files: `TOKEN.NZIP`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP`
  when those features are used
- Uppercase recipient-access sidecar: `ACCESS.NZIP` when hybrid encryption is
  used (§9.3)
- AI root: `wiki/`, `ai/`, or `context/` exactly as declared in the
  manifest when AI materials are present

**Readers MUST** match reserved `META-INF/**` paths with ASCII
case-insensitive comparison for discovery
(`META-INF/manifest.json`, `TOKEN.NZIP`, `NZIP.TOKEN`, `TIMESTAMP.NZIP`,
`TS-SUBMIT.NZIP`, `ACCESS.NZIP`, and OTS equivalents as defined by NeoZip
tooling). If more than one central-directory entry matches the same reserved
meta target under ASCII case-insensitive comparison, the archive is
**malformed**: readers **MUST** reject it and **MUST NOT** silently pick one
spelling.

Primary paths and AI-tree paths are case-preserving as stored.

---

## 2. `META-INF/manifest.json` — advanced features control surface

### 2.1 Role

`META-INF/manifest.json` is an **optional** structured control file for
**advanced package features**. It gives writers a place to declare profile
claims, discovery summaries, and feature-specific registries so tools can
understand the package without parsing only low-level ZIP headers.

It is **not** exclusive to AI. AI / ZipWiki packaging (§1.2, §4.3) is one
advanced consumer of this file. Other advanced uses include agent-facing profile
summaries (`"tokenized"`, `"timestamped"`, `"access-controlled"`, …), content
indexes, compression/encryption discovery hints, and future feature registries
registered in later revisions of this note.

It is **not** required for core cryptographic operations:

- Integrity verification (Extra Field `0x014E`, Merkle §7)
- Minting or verifying tokens (`TOKEN.NZIP`)
- Timestamp submit / confirm (`TS-SUBMIT.NZIP`, `TIMESTAMP.NZIP`)
- Recipient unwrap / content decrypt (`ACCESS.NZIP`, §9.3)

It **MUST** be present when the archive carries package AI materials under an AI
root (§1.2), or when the writer claims profiles such as `"zipwiki"` /
`"ai-aware"`. Writers **MAY** also emit it for non-AI advanced discovery (for
example tokenized or access-controlled packages that want machine-readable
summaries).

When present, it **MUST**:

1. Set `format` to `"neozip"`.
2. Set `specVersion` to the NeoZip Application Note version the package was
   written for (§4.1). **Recommended minimum:** `"0.1.1"` (NeoZipKit core profile
   that includes recipient access and current advanced-manifest semantics).
   Packages that use ZipWiki AI roots (`wiki/` / `ai/` / `context/`)
   **MUST**
   declare at least `"0.2.0"`.
3. Set `createdAt` to an ISO-8601 creation time (UTC recommended).

When present, it **MAY**:

1. List `profiles` for feature discovery (`"integrity"`, `"zipwiki"`,
   `"tokenized"`, `"timestamped"`, `"access-controlled"`, …).
2. Include feature-specific registries. The `ai` object (§4.3) is one such
   registry and **MUST** be included when AI materials exist; it **MUST** be
   omitted when they do not.

The **ZIP central directory** is authoritative for entry names, sizes, methods,
and offsets. Per-entry content hashes **SHOULD** use Extra Field `0x014E` (§7).
Sidecar proofs under `META-INF/*.NZIP` remain authoritative for chain and access
operations even when the manifest summarizes them.

### 2.2 Placement (when written)

1. **Path:** `META-INF/manifest.json`
2. **Position:** **SHOULD** be the first local-file entry and first central-
   directory entry (APPNOTE §4.1.11 / §4.7.2).
3. **Encoding:** UTF-8 JSON.
4. **Compression:** **RECOMMENDED** Store (0).
5. **Encryption** of the manifest is **DISCOURAGED** when discovery matters
   (tools cannot find advanced feature metadata).
6. **Discovery:** if `META-INF/manifest.json` has `"format": "neozip"`, treat
   the archive as NeoZip-profiled with an advanced features manifest.

### 2.3 Naming: `.nzip`

Archive filename **SHOULD** be `*.nzip`. A `.zip` with NeoZip Extra Fields,
sidecars, and/or a valid `manifest.json` (`"format": "neozip"`) remains
profile-conformant.

---

## 3. Entry classes and package shapes

### 3.1 Classification

Without an AI root, every entry outside `META-INF/` is primary content.

With package AI materials, `META-INF/manifest.json` **MUST** be present. Let
`R` be the AI root from the manifest (`ai.root`, one of `wiki`, `ai`,
`context`):

```
if path starts with META-INF/     → meta (manifest / blockchain / access)
else if path starts with R + "/"  → ai-namespace (parsed / okf / …)
else                               → primary content
```

Within the AI namespace:

```
R/okf/**                → OKF knowledge (optional)
R/parsed/<P>.md         → parsed text for primary <P> (optional per primary)
R/parsed/<P>.assets/**  → figure binaries for primary <P>
```

### 3.2 Pairing (verify)

Applies when an AI root is present (and thus a manifest):

- Parsed entry `R/parsed/P.md` **MUST** have primary entry `P`, **unless** the
  primary was intentionally omitted (`ai.primaries[].sourceIncluded: false`)
  for a document format that has a successful parse. Orphans otherwise fail.
- Asset paths under `R/parsed/P.assets/` **MUST** have primary `P`; **SHOULD**
  also have matching `R/parsed/P.md`.
- Absence of parse or OKF for a primary is **normal**.
- **Omit-original (extract-only) packages:** When a writer stores only the parse
  for an omittable document type (PDF, Office, …) and sets
  `ai.primaries[].sourceIncluded: false`, the parse path still uses `P` as if
  the primary existed. Readers **MUST** treat CD absence of `P` as intentional
  in that case — not as an orphan-parse failure. Plain text and images
  **SHOULD** remain as primaries even when a parse exists. When a remote or
  out-of-package original locator is known, writers **SHOULD** place Extra Field
  `0x014F` (§7.1.1) on `{R}/parsed/{P}.md` with every original attribute they
  actually know (URI, CRC-32, uncompressed size, Unix mtime); readers **SHOULD**
  read that field instead of treating the original as gone. Omit any attribute
  that was not observed — including CRC-32 if it was never calculated.
- **Unparsed primaries:** A primary **MAY** appear at zip root with
  `hasParsed: false` and still have an OKF concept that cites it (agents learn
  the file is in the package even when extract failed).

**Tables** live **inside** `R/parsed/P.md` as markdown.

**Merkle construction** (§7) uses every non-`META-INF/` central-directory entry,
including the AI root when present. Classification above is for open/routing
only and does **not** require a manifest.

### 3.3 Minimal integrity-only archive

Manifest optional; blockchain optional:

```
hello.txt.nzip
  hello.txt                       # Extra Field 0x014E recommended
```

With token binding only:

```
hello.txt.nzip
  META-INF/TOKEN.NZIP
  hello.txt
```

### 3.4 ZipWiki archive (standard `wiki/` root)

**Full layout** (parses + per-primary OKF; ZipWiki default):

```
archive.nzip
├── META-INF/
│   └── manifest.json
├── report.pdf                     # MAY be omitted when parsed + sourceIncluded:false
├── notes.txt
├── legacy.docx                    # Kept when parse failed / was skipped
└── wiki/
    ├── parsed/
    │   ├── report.pdf.md
    │   └── notes.txt.md
    └── okf/
        ├── index.md               # okf_version + # Files listing
        ├── report.md              # Concept for report.pdf
        ├── notes.md
        └── legacy.md              # Concept may exist without a parse
```

**Parse-only layout** (no OKF tree — valid ZipWiki / L4 when `ai` declares
`parsed/` and omits `ai.okf` or sets `present: false`):

```
archive.nzip
├── META-INF/
│   └── manifest.json              # ai.okf omitted or present:false
├── report.pdf                     # or omitted when extract-only
└── wiki/
    └── parsed/
        └── report.pdf.md
```

Manifest **required** when any AI root material is present:

```
packet.nzip
  META-INF/manifest.json          # Advanced features control (§2, §4)
  META-INF/TOKEN.NZIP              # optional
  report.pdf
  budget.xlsx
  cover.png
  wiki/
    okf/
      index.md
      report.md
      budget.md
      cover.md
    parsed/
      report.pdf.md
      report.pdf.assets/
        image_1.png
      budget.xlsx.md
```

Single- and multi-primary packages use the same layout. ZipWiki writers
**MAY** order central-directory entries as manifest → AI tree → primaries; that
order is a producer preference, **not** an APPNOTE requirement (see §10).

---

## 4. `META-INF/manifest.json` schema

Applies **when the advanced features manifest is present**. Body is a UTF-8 JSON
object. Unknown keys **MUST NOT** cause rejection. Writers **SHOULD** preserve
unknown keys on round-trip when practical.

Core crypto tools **MUST NOT** require this file for mint, stamp, recipient
decrypt, or Merkle verify.

The `ai` object (§4.3) is **AI-only**. Other top-level fields (`format`,
`specVersion`, `createdAt`, `profiles`, and future non-AI registries) apply to
advanced packages generally.

### 4.1 Required fields (when the file is present)

| Field | Type | Description |
| :---- | :---- | :---- |
| `format` | string | Always `"neozip"` |
| `specVersion` | string | Application Note version this package was written for. **Recommended minimum:** `"0.1.1"`. ZipWiki AI-root packages **MUST** use at least `"0.2.0"`. |
| `createdAt` | string | ISO-8601 creation time (UTC recommended) |

### 4.2 Recommended fields

| Field | Type | Description |
| :---- | :---- | :---- |
| `profiles` | string[] | Feature claims: `"integrity"`, `"zipwiki"`, `"tokenized"`, `"timestamped"`, `"ai-aware"`, `"access-controlled"`, … |
| `ai` | object | AI element registry (§4.3). **Required** when profile includes `"zipwiki"` / `"ai-aware"` or any AI root content is present |

### 4.3 The `ai` object (element registry)

`ai` declares where package AI materials live and what is present.

| Field | Type | Required | Description |
| :---- | :---- | :---- | :---- |
| `root` | string | **REQUIRED** when AI present | AI root directory name: `"wiki"`, `"ai"`, or `"context"` (no trailing slash) |
| `parsedDir` | string | RECOMMENDED | Relative parse directory under root; default `"parsed"` |
| `primaryCount` | number | RECOMMENDED | Count of primary content entries |
| `parsedCount` | number | RECOMMENDED | Count of files under `R/parsed/**` that end in `.md` and are not under `.assets/` |
| `assetEntryCount` | number | OPTIONAL | Count of zip entries under any `R/parsed/**/**.assets/` |
| `digest` | string | OPTIONAL | Package summary, at most 1000 characters, starting with the document count. When a model wrote the concept cards, ZipWiki sends `wiki/okf/index.md` and asks for one summary of the whole `# Files` list; otherwise it joins the OKF descriptions |
| `notice` | string | OPTIONAL | Plain statement copied from a `.zipwiki-notice.md` file in the pack folder. At most 500 characters. This is not a summary of the documents |
| `okf` | object | OPTIONAL | OKF availability (§4.4) |
| `parser` | object | OPTIONAL | Default parse engine (§4.5) |
| `primaries` | array | OPTIONAL | Advisory per-primary summary (§4.3.1). **Not** an inventory — ZIP central directory + Extra Field `0x014E` remain authoritative |

#### 4.3.1 `ai.primaries[]` (advisory)

Compact hints for agents and ZipWiki tools. Writers **SHOULD** keep entries
aligned with primary zip paths after collision rewrite. Verifiers and Merkle
construction **MUST NOT** require this array.

Do **not** duplicate data already authoritative elsewhere:

- Basename / entry identity → ZIP central directory (`path` is enough)
- Content SHA-256 → Extra Field `0x014E` on the primary entry
- Per-file prose summary → OKF concept `description` under `{ai.root}/okf/`

| Field | Type | Description |
| :---- | :---- | :---- |
| `path` | string | Zip entry name (e.g. `report.pdf` or `content/2/report.pdf`) |
| `mimeType` | string | OPTIONAL |
| `documentType` | string | OPTIONAL ZipWiki category / OKF type hint |
| `hasParsed` | boolean | `true` when `{ai.root}/parsed/{path}.md` is present |
| `sourceIncluded` | boolean | OPTIONAL. When `false`, primary bytes were intentionally omitted from the ZIP (extract-only / omit-original for an omittable document type that has a successful parse). Omit the field or set `true` when the primary entry is present. Readers **MUST NOT** treat CD absence of `path` as an orphan-parse failure when this is `false`. |

**Path construction:**

| Artifact | Path |
| :---- | :---- |
| OKF root | `{root}/okf/` |
| OKF concept for primary `P` | `{root}/okf/{stem}.md` where `stem` is the basename of `P` without its final extension (e.g. `report.pdf` → `report.md`) |
| OKF index | `{root}/okf/index.md` (optional; ZipWiki SHOULD emit) |
| Parsed text for primary `P` | `{root}/{parsedDir}/{P}.md` |
| Assets for primary `P` | `{root}/{parsedDir}/{P}.assets/{filename}` |

With defaults `root = "wiki"` and `parsedDir = "parsed"`:

| Primary `P` | Parsed text | OKF concept | Assets dir |
| :---- | :---- | :---- | :---- |
| `document.pdf` | `wiki/parsed/document.pdf.md` | `wiki/okf/document.md` | `wiki/parsed/document.pdf.assets/` |
| `docs/a/r.xlsx` | `wiki/parsed/docs/a/r.xlsx.md` | `wiki/okf/r.md` | `wiki/parsed/docs/a/r.xlsx.assets/` |

**Example:**

```json
{
  "format": "neozip",
  "specVersion": "0.2.0",
  "createdAt": "2026-09-02T16:40:00Z",
  "profiles": ["integrity", "zipwiki"],
  "ai": {
    "root": "wiki",
    "parsedDir": "parsed",
    "primaryCount": 3,
    "parsedCount": 2,
    "assetEntryCount": 1,
    "digest": "Sample packet with structured PDF and spreadsheet.",
    "okf": {
      "present": true,
      "root": "wiki/okf/",
      "index": "wiki/okf/index.md",
      "version": "0.2"
    },
    "parser": {
      "engine": "liteparse",
      "engineVersion": "2.9.0"
    },
    "primaries": [
      {
        "path": "report.pdf",
        "mimeType": "application/pdf",
        "documentType": "Financial_Report",
        "hasParsed": true,
        "sourceIncluded": false
      },
      {
        "path": "budget.xlsx",
        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "documentType": "Spreadsheet",
        "hasParsed": true,
        "sourceIncluded": false
      },
      {
        "path": "cover.png",
        "mimeType": "image/png",
        "documentType": "Generic",
        "hasParsed": true
      }
    ]
  }
}
```

Tokenized packages add `"tokenized"` (and optional `"timestamped"`) to
`profiles` and place proofs under `META-INF/` (§8).

**AI read algorithm (when AI-support is present):**

1. Open ZIP; parse `META-INF/manifest.json` (required for this path).
2. If `format != "neozip"`, treat as ordinary ZIP (no AI claims).
3. Read `ai.digest` / `profiles` for relevance.
4. Let `R = ai.root`.
5. If `ai.okf.present`, open OKF at `ai.okf.index` / `ai.okf.root` (§6).
6. For primary `P`, open `{R}/{parsedDir}/{P}.md` when present; resolve assets under
   `{R}/{parsedDir}/{P}.assets/`.
7. Open original `P` when original bytes are required and
   `sourceIncluded` is not `false` (or when the CD still contains `P`).
8. If integrity or token profiles claim trust, verify using Extra Field `0x014E`
   and blockchain sidecars per §7–§8 (those checks succeed without a manifest if
   only L1–L3 features are claimed).

### 4.4 `ai.okf` object

| Field | Type | Description |
| :---- | :---- | :---- |
| `present` | boolean | `true` when an OKF tree is in the package |
| `root` | string | Zip prefix, normally `"{ai.root}/okf/"` e.g. `"wiki/okf/"` |
| `index` | string | Bundle root markdown with `okf_version`, e.g. `"wiki/okf/index.md"` |
| `version` | string | OKF language version (e.g. `"0.2"`) |

If omitted or `present` is false, tools **MUST NOT** expect OKF.

### 4.5 `ai.parser` object (optional)

| Field | Type | Description |
| :---- | :---- | :---- |
| `engine` | string | e.g. `"liteparse"`, `"llamaparse"` |
| `engineVersion` | string | Optional |
| `notes` | string | Optional free text |
| `includeComplexity` | boolean | OPTIONAL — `true` when pack collected per-page complexity |
| `complexity` | object | OPTIONAL — rollup of LiteParse complexity / layout risk (§4.5.1) |
| `ocrConfidence` | object | OPTIONAL — aggregate of per-text-item OCR confidence when present (§4.5.2) |
| `route` | object | OPTIONAL — pack-time routing (§4.5.3), e.g. auto-escalation |

`complexity` and `ocrConfidence` are **routing / inspection signals**, not a
document-level parse-accuracy score. Native PDF text usually has no OCR
confidence (`ocrConfidence.scoredItemCount === 0`).

#### 4.5.1 `ai.parser.complexity`

| Field | Type | Description |
| :---- | :---- | :---- |
| `pageCount` | number | Pages with complexity attached |
| `needsOcrCount` / `needsOcrRatio` | number | Pages flagged `needsOcr` |
| `layoutComplexCount` / `layoutComplexRatio` | number | Pages with layout difficulty |
| `reasonCounts` | object | Histogram of OCR-need reasons (`scanned`, `garbled`, …) |
| `layoutReasonCounts` | object | Histogram of layout reasons (`multi-column`, …) |
| `maxColumnCount` | number | Max columns observed |
| `pages` | array | Compact per-page summary (`page`, `needsOcr`, `reasons`, layout fields) |

#### 4.5.2 `ai.parser.ocrConfidence`

| Field | Type | Description |
| :---- | :---- | :---- |
| `totalItemCount` | number | Text items inspected |
| `scoredItemCount` | number | Items that carried a numeric `confidence` |
| `mean` / `min` / `max` | number | Present only when `scoredItemCount > 0` |

#### 4.5.3 `ai.parser.route`

Present when pack used auto routing (or recorded a skipped escalate):

| Field | Type | Description |
| :---- | :---- | :---- |
| `mode` | string | `"fixed"` or `"auto"` |
| `escalatedFrom` | string | e.g. `"liteparse"` when LlamaParse won after a probe |
| `reason` | string | Threshold or skip reason |

**Example `ai.parser`:**

```json
{
  "engine": "liteparse",
  "engineVersion": "2.9.0",
  "includeComplexity": true,
  "complexity": {
    "pageCount": 2,
    "needsOcrCount": 1,
    "needsOcrRatio": 0.5,
    "layoutComplexCount": 1,
    "layoutComplexRatio": 0.5,
    "reasonCounts": { "scanned": 1 },
    "layoutReasonCounts": { "multi-column": 1 },
    "maxColumnCount": 2,
    "pages": [
      {
        "page": 1,
        "needsOcr": false,
        "reasons": [],
        "layoutComplex": true,
        "layoutReasons": ["multi-column"],
        "columnCount": 2
      },
      {
        "page": 2,
        "needsOcr": true,
        "reasons": ["scanned"],
        "layoutComplex": false,
        "layoutReasons": [],
        "columnCount": 1
      }
    ]
  },
  "ocrConfidence": {
    "totalItemCount": 120,
    "scoredItemCount": 0
  }
}
```

---

## 5. Parsed artifacts

Parsed AI-readable output for primary `P` is stored as ZIP members under the AI
root.

### 5.1 Structured text — `{R}/parsed/{P}.md`

| Rule | Requirement |
| :---- | :---- |
| Presence | Optional per primary |
| Path | `{ai.root}/{ai.parsedDir or "parsed"}/{P}.md` |
| Content | UTF-8 whole-document body (typically markdown from LiteParse or equivalent) |
| Tables | Inside this file |
| Pairing | Requires primary `P` |

### 5.2 Structured assets — `{R}/parsed/{P}.assets/`

| Rule | Requirement |
| :---- | :---- |
| Presence | Optional; when figures were extracted for that parse |
| Path | `{ai.root}/parsed/{P}.assets/{filename}` |
| Markdown links | Parsed markdown **SHOULD** use relative links into its `.assets/` sibling dir |
| Pairing | Requires primary `P`; **SHOULD** have matching `{P}.md` |

### 5.3 Opening parsed content

1. Resolve primary `P` from the central directory (or package routing).
2. Open `{R}/parsed/{P}.md` if present.
3. Resolve relative image refs under `{R}/parsed/{P}.assets/`.
4. Open `P` when original bytes are required.

---

## 6. OKF bundle

### 6.1 Placement

OKF v0.2 knowledge lives under the AI root:

```
{wiki|ai|context}/okf/
```

Layouts follow [OKF_SPEC.md](https://github.com/NeoWareInc/format-specs/blob/main/OKF_SPEC.md). An OKF **bundle** is a directory of
markdown files. ZipWiki writers **SHOULD** emit:

| Entry (with `wiki/` root) | Role |
| :---- | :---- |
| `wiki/okf/index.md` | Bundle listing + `okf_version: "0.2"` and a `# Files` list (OKF §8 / §12) |
| `wiki/okf/{stem}.md` | **One concept per primary** (stem = primary basename without extension) |
| `wiki/okf/document.md` | Legacy package-level concept; accepted, not preferred for new multi-primary packs |
| `wiki/okf/log.md` | Not written. OKF allows an optional log; ZipWiki does not emit one |

Consumers **MUST NOT** reject a bundle for missing `index.md` (OKF §11).

The entire `okf/` tree is **optional**. Packages **MAY** ship `parsed/` without
OKF (omit `ai.okf` or set `present: false`). Packages **MAY** also ship OKF
concepts for primaries that have **no** parse extract (filename / type context
only) so agents still discover that the primary is part of the package.

### 6.2 Declaration

Advertised via `manifest.json` → `ai.okf` (§4.4). Writers **MUST** keep
`ai.okf` consistent with the central directory. When no OKF members exist,
writers **MUST** omit `ai.okf` or set `present: false`.

### 6.3 Relation to primaries and parses

- OKF concepts **MUST** cite **primary** entry paths as `sources[].resource`
  paths that resolve **relative to `{R}/okf/`** (e.g. primary `report.pdf` →
  `../../report.pdf`). Do **not** cite host staging paths outside the package.
- Concepts **MAY** also cite `{R}/parsed/{P}.md` when a parse exists
  (e.g. `../parsed/report.pdf.md` from `wiki/okf/`).
- When parse failed or was skipped, the concept **SHOULD** still cite the
  primary so agents know the bytes live in the ZIP (or that
  `sourceIncluded: false` applies for extract-only parses).
- Prefer **one concept file per primary** for multi-primary packages; a single
  shared `document.md` remains valid for simple packages.

### 6.4 Agent open sequence

1. Read `ai.okf` from the manifest.
2. If `present` is false or `ai.okf` is omitted, skip OKF and use `parsed/` /
   primaries only.
3. If present, open `ai.okf.index` when set; otherwise open concepts under
   `ai.okf.root`.
4. Follow OKF `sources` / links to primaries or `parsed/` members.
5. Open OKF when `ai.okf.present` is true, independent of other profile flags.

---

## 7. Integrity: Extra Field `0x014E` and merkle root

Aligned with NeoZipKit Application Note **0.1.1** for crypto and chain core
ZipWiki packaging adds the AI
root under the same Merkle leaf set as any other non-meta content. Compression,
encryption (including recipient / hybrid access), Token Service, and verify
implementer rules are in §8–§9.

### 7.1 Extra Field `0x014E` (SHA-256)

Present in local and/or central directory Extra Field (APPNOTE §4.5):

```
Header ID   = 0x014E          (2 bytes, little-endian)  // NeoZip "N" family
Data Size   = 32              (2 bytes)
SHA-256     = <32 bytes>      // digest of this entry's uncompressed payload
```

Semantics:

- Digest **MUST** be SHA-256 over the entry’s **uncompressed** file data (same
  bytes a correct extract would write).
- Writers **MAY** omit Extra Field `0x014E`. ZIP CRC-32 in the local and
  central headers is always present and is the default integrity check.
  ZipWiki writes `0x014E` only when requested. When the `"integrity"` profile
  is claimed, writers **SHOULD** emit `0x014E` on content entries.
- For the archive Merkle root (§7.3–§7.4): under **v0**, leaf hashes **SHOULD**
  equal these per-entry digests; under **v1**, leaves are
  `SHA-256(0x00 ‖ uncompressed_bytes)` and **MUST NOT** be confused with the bare
  `0x014E` value. Merkle **root values** are bound only when a blockchain
  sidecar requires them (`TOKEN.NZIP` / `TIMESTAMP.NZIP`).
- Unknown Extra Fields: APPNOTE requires readers to skip; NeoZip-unaware tools
  remain compatible.

| ID | Status | Use |
| :---- | :---- | :---- |
| `0x014E` | **Assigned** | Per-entry SHA-256 of **this entry’s** uncompressed payload |
| `0x014F` | **Assigned** | Original locator (`HDR_ID.NEO_ORIGIN`) — §7.1.1 |
| `0x0150`–`0x0153` | Reserved (NeoZip) | Future Merkle / profile hints |
| `0x024E` | Assigned (NeoEncrypt) | Encryption metadata (§9); distinct from integrity |

### 7.1.1 Extra Field `0x014F` (original locator)

Present in local and/or central directory Extra Field on a **parsed** member
`{R}/parsed/{P}.md` when the writer knows any out-of-package original attribute
for primary `P` (especially when `sourceIncluded: false` and `P` is absent from
the CD). Stock ZIP tools ignore unknown Extra Fields (APPNOTE §4.5).

Each attribute is independently optional. Presence is the only signal that a
value is known: `0` is a valid CRC (empty original), a valid size (empty
original), and a valid Unix mtime (exactly 1970-01-01T00:00:00Z). Writers
**MUST NOT** invent a URI, CRC, size, mtime, or SHA-256. Writers **MUST** omit
the entire Extra Field when no attribute is known.

#### 7.1.1.1 v1 wire

`0x014F` remains **version 1** until the first NeoZip / ZipWiki release.
Pre-release encodings are not valid and **MUST NOT** be treated as a prior
on-wire version.

```
Header ID   = 0x014F          (2 bytes, little-endian)
Data Size   = 1 + Σ(3 + value_len)
Data:
  version   = 0x01            (1 byte)
  records   = zero or more TLV:
    tag     = <uint8>         (1 byte)
    len     = <uint16 LE>     (2 bytes)
    value   = <len bytes>
```

Registered tags (write in ascending tag order; readers **MUST** accept any
order). Duplicate tags: last occurrence wins. Tag `0x00` **MUST NOT** be
written. Unknown tags and known tags with the wrong `len` **MUST** be skipped
so new attributes can be added without a version bump.

| Tag | Name | `len` | Value |
| :---- | :---- | :---- | :---- |
| `0x01` | `uri` | 1… | UTF-8 RFC 3986 absolute URI, no NUL, no BOM. **SHOULD** be ≤ 2048 bytes. `https:` / `http:` preferred; `file:` (RFC 8089) allowed. Relative paths and bare OS paths **MUST NOT** appear |
| `0x02` | `crc32` | 4 | ZIP/IEEE CRC-32 of the **original uncompressed bytes** (the value that would have been `P`’s CD CRC-32). **Not** the CRC of the parse markdown. Omit this tag if CRC was not calculated. ZipWiki writers omit this tag when tag `0x05` is written |
| `0x03` | `size` | 8 | Original uncompressed length as **uint64 LE**. Omit if unknown |
| `0x04` | `mtime` | 8 | Original modification time as **int64 LE Unix seconds** (UTC, seconds since 1970-01-01T00:00:00Z). Negative values are pre-epoch. Sub-second precision is discarded. Omit if unknown |
| `0x05` | `sha256` | 32 | SHA-256 of the **original uncompressed bytes**. **Not** the digest of the parse markdown (that, when present, is Extra Field `0x014E` on the parse entry). Omit this tag unless the writer was asked to include original SHA-256. When written, omit tag `0x02` |

`0x014E` on the parse entry, when written, remains SHA-256 of the **parse
markdown**. Concatenate after `0x014E` when both are present. ZipWiki’s default
writer omits `0x014E` (ZIP CRC-32 only) and may emit `0x014F` alone.

Readers **MUST** skip the field when the first data byte is not `0x01`.

This field does **not** belong on a missing primary entry (there is no CD
record when omitted). Pairing remains via the parse path naming `P`.

### 7.2 Purpose and algorithms

A single digest binds Token Service timestamps and blockchain tokens to
**content bytes**, not filenames alone.

| Algorithm | Status | Odd-leaf rule | Domain separation |
| :---- | :---- | :---- | :---- |
| **v0** (§7.3) | Legacy | Duplicate last leaf (Bitcoin-style) | None |
| **v1** (§7.4) | Current | Promote odd node unhashed ([RFC 6962](https://datatracker.ietf.org/doc/html/rfc6962)–style) | `0x00` leaf / `0x01` interior |

New archives **MUST** compute the Merkle root with **v1** and bind it where
proofs require it (e.g. `TOKEN.NZIP` / `TIMESTAMP.NZIP` `merkleRoot`). Writers
**MUST NOT** require a stored Merkle root for ordinary ZIP / ZipWiki packages.
Verifiers **MUST** accept both algorithms under §7.5 so legacy on-chain
bindings remain checkable.

Rationale for v1 (hardening over v0):

1. **Odd-leaf duplication (CVE-2012-2459 class):** Bitcoin-style `H_n ‖ H_n`
   pairing allows second-preimage trees of different depth/structure that share
   a root. Pass-through promotion removes that class of ambiguity.
2. **Leaf vs interior collision:** Without domain separation, a 64-byte content
   file equal to `H_left ‖ H_right` can make a leaf digest collide with an
   interior node. Prefix bytes `0x00` / `0x01` separate the domains.
3. **Path sort ambiguity:** Writers and verifiers **MUST** normalize paths
   before sorting so Windows / `./` / Unicode NFC variants cannot reorder
   leaves.

### 7.3 v0 algorithm (legacy)

**Status:** legacy. Writers **MUST NOT** emit new proof-bound roots with v0.
Verifiers retain v0 only for §7.5 fallback against existing on-chain / Token
Service records.

1. Collect all non-`META-INF/` content entries **directly from the ZIP central
   directory** (exclude every entry whose name is under `META-INF/**`, including
   `ACCESS.NZIP`, token/timestamp sidecars, and optional `manifest.json`). Include
   primary entries **and** the AI root (`wiki/`, `ai/`, or `context/**`) when
   present.
2. For each entry, take `H_leaf = SHA-256(uncompressed bytes)` (= Extra Field
   `0x014E` value when present).
3. Sort leaves by central-directory path (UTF-8 byte order). Path normalization
   was not required by v0; verifiers reconstructing v0 roots **SHOULD** use the
   path bytes exactly as stored in the central directory file name.
4. Build a binary Merkle tree with SHA-256. **Odd-leaf rule:** when a level has
   an odd count, **duplicate the last leaf** before pairing (Bitcoin-style):  
   `H_parent = SHA-256(H_left ‖ H_right)` with no domain prefix.
5. Bind the lowercase hex encoding of the 32-byte root in token/timestamp
   payloads (historical archives only).

For a single content entry, a v0 root **MAY** equal that entry’s SHA-256
(single-leaf tree).

### 7.4 v1 algorithm (RFC 6962–style, current)

**Status:** current. Writers **MUST** use v1 for new archives.

1. Collect all non-`META-INF/` content entries **directly from the ZIP central
   directory** (exclude every entry whose name is under `META-INF/**`, including
   `ACCESS.NZIP`, token/timestamp sidecars, and optional `manifest.json`). Include
   the AI root when present. Do **not** require any inventory in
   `manifest.json` for Merkle construction.
2. **Normalize each entry path** before sorting:
   - Decode as UTF-8 (central-directory file name bytes per APPNOTE).
   - Use POSIX separators only (`/` — convert `\` to `/`).
   - Strip a single leading `./` if present, then strip leading `/` characters.
   - Canonicalize to Unicode **NFC**.
3. Sort entries strictly by the normalized path’s UTF-8 **byte** order.
4. **Leaf hash** for each entry (domain-separated):  
   `H_leaf = SHA-256(0x00 ‖ uncompressed_bytes)`  
   where `uncompressed_bytes` are the same bytes hashed into Extra Field
   `0x014E` (payload content only — **not** the path).  
   Note: `0x014E` remains `SHA-256(uncompressed_bytes)` without the `0x00`
   prefix; the leaf prefix applies only when folding digests into the Merkle
   tree. Implementations **MUST** either re-hash content with the `0x00`
   prefix or equivalently compute `SHA-256(0x00 ‖ payload)` from stored bytes;
   they **MUST NOT** treat the raw `0x014E` digest as `H_leaf` under v1.
5. **Tree hash** (RFC 6962–style):
   - Pair adjacent hashes `(H_i, H_{i+1})` →  
     `H_parent = SHA-256(0x01 ‖ H_i ‖ H_{i+1})`.
   - If a level has an **odd** count, **promote** the last node to the next
     level **unhashed** (do not duplicate / self-hash).
6. Repeat until one root remains. Store the lowercase hex encoding of the
   32-byte root in token/timestamp payloads after all package members that
   participate as leaves are final.

For a single content entry, the v1 root **MUST** equal
`SHA-256(0x00 ‖ uncompressed_bytes)` (single-leaf tree with domain separation —
**not** the bare `0x014E` digest).

**Future consideration (not part of v1):** if per-file inclusion proofs need to
bind path identity into the leaf, a later algorithm version may use  
`H_leaf = SHA-256(0x00 ‖ path_bytes ‖ 0x00 ‖ uncompressed_bytes)`. That change
would be a new algorithm id, not a silent tweak to v1.

### 7.5 Verification

Verification rebuilds a candidate root from **central-directory content
entries** (all non-`META-INF/**`) and compares it, when present, to on-chain /
Token Service records (`TOKEN.NZIP`, `TIMESTAMP.NZIP`). Optional `manifest.json`
summaries are convenience only for agents and **MUST NOT** be the sole source of
truth when a sidecar / on-chain root is available.

**Primary path (declared `specVersion` in the advanced features manifest when
present):**

1. If `manifest.json` is present and contains `specVersion`, compute the Merkle
   root with the **v1** algorithm (§7.4) and compare to the declared / on-chain
   root.
2. Match → verification **SUCCESS** (high security).
3. Mismatch → do **not** stop yet when verifying against an external (on-chain /
   Token Service) record; continue with the fallback pass below so legacy
   bindings remain checkable. Local-only checks that require a v1 match **MAY**
   fail immediately when the writer is known to be v1-only.

**Fallback pass (`specVersion` omitted, unverified, or v1 mismatch against an
on-chain record):**

1. Compute the **v1** root → compare with the on-chain / Token Service record.  
   - Match → verification **SUCCESS** (**High Security**).
2. Else compute the **v0** root (§7.3) → compare with the on-chain / Token
   Service record.  
   - Match → verification **SUCCESS** (**Legacy Security**); the verifier
   **MUST** issue a warning that the archive uses the legacy merkle algorithm
   (odd-leaf duplication / no domain separation).
3. Else verification **FAIL**.

**Implementer requirements:**

- On legacy (v0) success, verifiers **MUST** surface a warning (structured field
  when machine-readable output is used).
- Hard mismatch after both algorithms → verification **MUST** fail. Extraction
  **MAY** still proceed only when the operator or API **explicitly** opts out of
  integrity enforcement for that operation.
- Implementations **MUST NOT** accept an archive as high-security verified solely
  because a v0 root matched when a v1 root also could have been tried first —
  the fallback order above is mandatory so v1 is preferred whenever it matches.

---

## 8. Blockchain and Token Service

Sidecars live under `META-INF/`:

| Entry | When written | Purpose |
| :---- | :---- | :---- |
| `META-INF/TOKEN.NZIP` | After successful on-chain mint | On-chain token binding |
| `META-INF/TIMESTAMP.NZIP` | After confirmed Token Service stamp | Timestamp proof metadata |
| `META-INF/TS-SUBMIT.NZIP` | After stamp submit, before confirm | Pending timestamp submission |

Alternate token entry recognized by NeoZip readers: `META-INF/NZIP.TOKEN`
(legacy). Writers **MUST** emit `META-INF/TOKEN.NZIP`. Readers discover reserved
meta paths with ASCII case-insensitive comparison (§1.3).

`merkleRoot` in these payloads **MUST** match the archive root from §7 (v1 for
new archives). When an advanced features manifest is present, it **MAY** list
`profiles` such as `"tokenized"` / `"timestamped"`; sidecars remain
authoritative for proofs.

### 8.1 Networks

NeoZip tooling **defaults** to **Base Sepolia** (`base-sepolia`, chain ID
`84532`) for development.

Token Service hosts (selected via environment / connection profile, e.g.
`TOKEN_SERVICE_NETWORK`):

| Profile | Chain | Token Service host |
| :------ | :---- | :----------------- |
| `base-sepolia` (default) | Base Sepolia `84532` | `https://testnet.token-service.neozip.io` |
| `base` | Base Mainnet `8453` | `https://token-service.neozip.io` |

Production networks are also selected via client configuration / connection
store. On-chain contract addresses and chain IDs for tokens live in connection
config and `TOKEN.NZIP` / library contract tables (not in this note alone).

Paid token purchase on mainnet is **not** specified for this profile generation
(`purchaseAvailable` is false until a later revision).

### 8.2 Mint flow (informative)

1. Create archive with per-entry SHA-256 Extra Fields → compute **v1** Merkle
   root from the central directory (§7.4), after all non-`META-INF/` members that
   participate as leaves are final.
2. A mint operation issues an NFT / token bound to that Merkle root.
3. Writer appends/updates `META-INF/TOKEN.NZIP`. If `manifest.json` is present,
   it **MAY** update agent-facing summaries and `profiles` to include
   `"tokenized"`.

### 8.3 `TOKEN.NZIP` logical fields

Implementations store a versioned envelope. Logical fields observed / required
for verification:

| Field | Description |
| :---- | :---- |
| `tokenId` | On-chain token id |
| `contractAddress` | Token contract |
| `network` / `networkChainId` | Chain identity |
| `merkleRoot` | Must match archive root from §7 |
| `transactionHash` / `blockNumber` | Mint proof |
| `owner` | Mint-time owner address |
| `creationTimestamp` | Chain / service time |
| `contractVersion` | Contract ABI/version tag |
| `encryptedHash` | Optional binding when archive is encrypted |

### 8.4 Timestamp flow (informative)

1. Token Service submit → `META-INF/TS-SUBMIT.NZIP` (pending).
2. After confirmation → `META-INF/TIMESTAMP.NZIP` (pending submit entry removed or
   left inert per implementation).
3. If `manifest.json` is present, discovery summaries **MAY** be updated and
   `profiles` may include `"timestamped"`.

OpenTimestamps is an optional product feature and **MAY** be advertised with a
future profile flag `"ots"`.

### 8.5 Data Wallet / connection store (out of band)

Credentials (wallet passkeys, Token Service email/token, network prefs) live in
a user connection store — **not** inside the archive. Archives carry proofs, not
private keys.

---

## 9. Compression and encryption

Compression method and encryption are set **per zip entry** on local headers;
readers use the central directory and local file headers (APPNOTE).

### 9.1 Compression methods

| Method | APPNOTE method ID | NeoZip default | Notes |
| :---- | :---- | :---- | :---- |
| Store | 0 | optional | Recommended for `manifest.json` and other small control entries; often best for already-compressed media |
| Deflate | 8 | Info-ZIP interop path | Stock Info-ZIP readable |
| Zstd | **93** | **default** | Official PKWARE APPNOTE 6.3.8+ assignment (method 20 deprecated). Readable by Zstd-aware ZIP tools (e.g. WinZip 25+). Stock Info-ZIP `unzip` generally cannot inflate method 93. |

Writers using Zstd **MUST** set general-purpose flags and version-needed fields
consistently with NeoZip implementation practice.

Readers that do not understand method 93 **MUST** report a clear
unsupported-method error (not silent data loss).

**Legacy interoperability profile:** writers **MAY** emit Deflate (or Store)
instead of Zstd and omit NeoZip blockchain sidecars so stock Info-ZIP tooling
can fully extract the content entries. That interop path is product policy; the
on-wire methods remain 0 / 8 / 93 as above.

### 9.2 Encryption

| Method | Role | Wire identification | Notes |
| :---- | :---- | :---- | :---- |
| None | Default for many workflows | Bit 0 clear | Allowed; common for AI-readable packages |
| NeoEncrypt (NEO AES-256) | NeoZip **default** AES for confidential archives | **Real compression method** (0 / 8 / 93 / …) + Extra Field **`0x024E`** | Ciphertext stream matches WinZip AES-256 (PBKDF2, CTR, HMAC); headers do **not** use method 99 or `0x9901`. Stock Info-ZIP often misreads this path. |
| WinZip AES-256 | Interop write/read | **Compression method 99** + Extra Field **`0x9901`** | Industry AE-1/AE-2 encoding. NeoZip-aware tools **recognize** this form; it is **not** the product default for AES writing. |
| Traditional PKZIP (ZipCrypto) | Legacy only | Bit 0 set; no AES extra | Weak by modern standards. **MAY** be used for maximum legacy unzip interop when encrypting. |

#### 9.2.1 NeoEncrypt (default NeoZip AES-256)

NeoZip’s default AES-256 path is **NeoEncrypt** (see NeoZipKit
`docs/NEO_CRYPTO_FORMAT.md` in the NeoZipKit tree):

1. Local and central directory **compression method** stays the **real** codec
   (store / deflate / zstd…).
2. General-purpose **bit 0** (encrypted) is set.
3. Extra Field **`0x024E`** (`HDR_ID.NEO_CRYPTO`) carries NeoEncrypt metadata
   (magic `NEZ\0`, format version, algorithm id = AES-256 v1). Distinct from
   integrity Extra Field **`0x014E`**.
4. File data payload is the same layout as WinZip AES-256:
   `salt ‖ password-verifier(2) ‖ AES-CTR ciphertext ‖ HMAC-SHA1(10)`.

Product defaults that emit NeoZip AES-256 **MUST** use this form. Generic tools
that assume ZipCrypto for “encrypted + deflate/zstd” will not extract correctly —
use a NeoZip-aware reader.

#### 9.2.2 WinZip AES (recognized; different encryption codes)

WinZip AE-x is a separate on-wire profile (PKWARE method **99** + Extra Field
**`0x9901`**):

1. LO/CEN compression method is **99** (real method lives inside `0x9901`).
2. Extra Field **`0x9901`**: vendor version (AE-1 = 1, AE-2 = 2), vendor ID
   `"AE"`, strength (1/2/3), real compression method.
3. Ciphertext layout matches NeoEncrypt’s AES-256 stream for strength 3.

| | NeoEncrypt (NeoZip default) | WinZip AES (interop) |
| :---- | :---- | :---- |
| Compression method in LO/CEN | Real method (**0**, **8**, **93**, …) | **99** |
| Extra Field ID | **`0x024E`** | **`0x9901`** |
| Ciphertext layout | WinZip AES-256 stream | Same (for AES-256) |
| Default product AES write | **Yes** | No (explicit interop write only) |
| NeoZip-aware extract | **Yes** | **Yes** (recognized on read) |

Writers **MUST NOT** place both `0x9901` and `0x024E` on the same entry. Readers
that support both **MUST** discriminate on Extra Field ID / method 99, not on
“encrypted + password” alone.

When `manifest.json` is written for a confidential package, writers
**SHOULD** set an agent-facing encryption summary when useful (e.g. NeoEncrypt,
WinZip AES, ZipCrypto, or `"hybrid-recipient"` when §9.3 applies).

Encryption of `META-INF/*.NZIP` public proofs (including `ACCESS.NZIP`) and of
optional `META-INF/manifest.json` is **DISCOURAGED** when discovery matters
(tools cannot find digests/proofs/recipient wraps). Prefer encrypting content
entries while leaving `META-INF/` public proofs readable, unless the entire
archive is confidential.

### 9.3 Recipient / hybrid encryption (`META-INF/ACCESS.NZIP`)

Optional **recipient access control** binds content decryption to holders of
specific **secp256k1** private keys. The on-wire profile is a **hybrid** design:
an inner ZIP AES password encrypts content entries; that password is wrapped once
per recipient with **ECIES** and stored in a public sidecar.

This section is normative for NeoZip-aware tools that **read or write**
`META-INF/ACCESS.NZIP`. Base NeoZipKit MAY omit write support; Pro /
access-controlled products implement the full pipeline. Normative text matches
NeoZipKit Application Note **0.1.1** §4.3.

#### 9.3.1 Write rules (when `ACCESS.NZIP` is present)

1. Writers **MUST** emit the path exactly as `META-INF/ACCESS.NZIP`.
2. The entry **SHOULD** use compression method **Store (0)** so tools can read
   the JSON without inflate support beyond local headers.
3. The entry **MUST NOT** be encrypted with the same inner password / AES layer
   used for content entries. Recipient-aware tools and generic ZIP listers
   **MUST** be able to read `ACCESS.NZIP` without unwrapping any recipient key.
4. Body **MUST** be UTF-8 JSON conforming to the logical schema in §9.3.3.

#### 9.3.2 Hybrid model

1. **Inner (symmetric):** Generate a high-entropy secret (NeoZip Pro practice: 32
   random bytes encoded as a 64-character hex string). Pass it as the ZIP
   password for **NeoEncrypt** (`0x024E`, §9.2.1) by default, or optionally
   WinZip AES (`0x9901` / method 99, §9.2.2). Encrypt **content** entries with
   that password.
2. **Outer (asymmetric):** For each recipient, wrap the **UTF-8 bytes of the
   inner password string** with **ECIES on secp256k1** (algorithm id
   `ecies-secp256k1-aes256gcm`).
3. **Sidecar:** Serialize recipient wraps and metadata as UTF-8 JSON and write
   **`META-INF/ACCESS.NZIP`** per §9.3.1 (STORED, **unencrypted**).

```
Inner password ──► NeoEncrypt / WinZip AES ──► encrypted content entries
       │
       └──► ECIES wrap (per recipient) ──► META-INF/ACCESS.NZIP (public JSON)
```

#### 9.3.3 Outer wrap algorithm (`ecies-secp256k1-aes256gcm`)

**Wrap (per recipient):**

1. Recipient public key: uncompressed secp256k1, hex with `04` prefix (130 hex
   characters).
2. Generate an ephemeral secp256k1 key pair.
3. ECDH: ephemeral private × recipient public → shared secret.
4. HKDF-SHA256 over the shared secret → 32-byte wrapping key.
5. AES-256-GCM encrypt the UTF-8 password bytes (random 12-byte IV).
6. Store ciphertext as base64 of **`IV (12) ‖ auth tag (16) ‖ ciphertext`**, plus
   the ephemeral public key (uncompressed hex).

**Unwrap:** ECDH with recipient private × ephemeral public → same HKDF →
AES-GCM decrypt. Match the recipient by deriving the public key from the
supplied private key and comparing (case-insensitive) to
`recipients[].publicKeyHex`.

#### 9.3.4 `ACCESS.NZIP` logical schema

Top-level fields (UTF-8 JSON):

| Field | Type | Purpose |
| :---- | :---- | :---- |
| `version` | string | Metadata format version (e.g. `"1.0"`) |
| `scheme` | string | How identities were resolved: `ens-hybrid` \| `address-hybrid` \| `did-hybrid` \| `lit-protocol` |
| `recipients` | array | Per-recipient wrap records (§9.3.5) |
| `encryption` | object | Inner method: `{ "method": "neo-aes256" \| "aes-256-winzip", "note"? }` |
| `created` | string | ISO-8601 timestamp |
| `proVersion` | string | Implementing product version (informative) |

When `manifest.json` is present for an access-controlled archive,
writers **SHOULD** include `"access-controlled"` (and/or `"recipient-encrypted"`)
in `profiles`.

#### 9.3.5 Each `recipients[]` entry

| Field | Type | Purpose |
| :---- | :---- | :---- |
| `identity` | string | Original identity string (ENS name, `0x…` address, `pkp:0x…`, DID, …) |
| `identityType` | string | `ens` \| `address` \| `did` \| `lit-pkp` |
| `resolvedAddress` | string | Checksummed Ethereum address where applicable |
| `publicKeyHex` | string | Uncompressed secp256k1 public key used for wrapping |
| `wrappedKey` | string | Base64 ECIES payload (§9.3.3) |
| `ephemeralPublicKey` | string | Hex ephemeral public key |
| `keyAlgorithm` | string | e.g. `ecies-secp256k1-aes256gcm` |

**Homogeneity:** All recipients in one archive **MUST** share the same
`identityType` (no mixing ENS with Lit PKP in a single `ACCESS.NZIP`).

**Multiple recipients:** Each entry wraps the **same** inner password. Any
matching private key recovers the AES layer.

#### 9.3.6 Identity resolution (informative)

Resolution is product-side; the wire format only requires a trusted
`publicKeyHex` per recipient.

| Type | Identity string | Notes |
| :---- | :---- | :---- |
| `ens` | `*.eth` | Resolve name → ENS text `io.neozip.pubkey` (uncompressed hex) |
| `address` | `0x` + 40 hex | Address alone does not yield a unique pubkey; caller **MUST** supply `publicKeyHex` |
| `lit-pkp` | `pkp:0x…` | Same hybrid ECIES wrap to the PKP’s secp256k1 pubkey; scheme `lit-protocol`. Lit **Access Control Conditions** / threshold decryption without the unwrap key are **out of scope** for this profile |
| `did` | DID URI | Reserved for DID-based resolution (`did-hybrid`) |

#### 9.3.7 Decrypt flow (informative)

1. Locate and parse `META-INF/ACCESS.NZIP` (case-insensitive discovery, §1.3).
2. Find `recipients[]` entry matching the caller’s public key.
3. Unwrap → inner password; decrypt content entries with NeoZip AES rules (§9.2).
4. If no recipient matches, fail explicitly (wrong key).

#### 9.3.8 Privacy note

`ACCESS.NZIP` is **not** confidential: anyone with the archive can read
recipient identities, addresses, algorithms, and ciphertext blobs. Wrapped keys
remain ciphertext without the matching private key; the sidecar still leaks
**who** was targeted.

---

## 10. First-entry rule and selective read

1. When written, `META-INF/manifest.json` **SHOULD** be the first local-file
   entry and first central-directory entry (APPNOTE §4.1.11 / §4.7.2).
2. Catalog and verify tools **SHOULD** read the central directory (EOCD →
   central headers) and stream only needed `META-INF/**` sidecars / content
   digests without inflating bulk payloads when possible.
3. AI / ZipWiki tools **SHOULD** read the advanced features manifest when
   present, then open AI root members and primaries as needed.
4. Integrity verification uses CD entries, Extra Fields, and optional `*.NZIP`
   sidecars — it **MUST NOT** require `manifest.json`.
5. Self-extracting and split archives follow PKWARE; NeoZip profile metadata
   rules are unchanged.

---

## 11. Conformance levels

| Level | Name | Requirements |
| :---- | :---- | :---- |
| L0 | Plain ZIP | Valid APPNOTE ZIP (CRC-32 per member) |
| L1 | NeoZip integrity | L0 + per-content `0x014E` on content entries + computable Merkle root (§7). **No** `manifest.json` required. |
| L2 | Timestamped | L1 + valid `META-INF/TIMESTAMP.NZIP` bound to Merkle root |
| L3 | Tokenized | L1 + valid `META-INF/TOKEN.NZIP` bound to Merkle root (L2 optional) |
| L4 | ZipWiki AI | L0 + AI materials + `META-INF/manifest.json` with `"zipwiki"` (or equivalent) profile + valid `ai` block with `root`; parsed / OKF as declared. L1 extras (`0x014E` / Merkle) are independent and optional unless `"integrity"` or L2/L3 is claimed |
| **+Access** | Recipient-encrypted | Any L0–L4 level **plus** valid `META-INF/ACCESS.NZIP` and decryptable content for at least one listed recipient (§9.3). Combinable with L4. |

L4 and **+Access** are additive: they never substitute for L1–L3 cryptographic
requirements. Absence of `manifest.json` does not lower L1–L3 validity.

---

## 12. Compatibility

| Consumer | Behavior |
| :---- | :---- |
| Info-ZIP / Finder / Explorer | Lists/extracts content; shows `META-INF/` (and AI root when present) as folders; ignores Extra Field `0x014E`; cannot inflate Zstd (method 93) without a Zstd-capable reader; can read plaintext `ACCESS.NZIP` JSON but cannot unwrap without a NeoZip-aware recipient tool |
| Java `jar` tools | Treats the archive as a ZIP; ignore NeoZip Extra Fields and `META-INF/*.NZIP` unless NeoZip-aware |
| WinZip 25+ / other APPNOTE 6.3.8+ Zstd readers | Can inflate method 93; NeoZip Extra Fields and `META-INF/*.NZIP` treated as ordinary data unless NeoZip-aware |
| NeoZip-aware tools | Full L1–L3 verify from Extra Fields + `*.NZIP` sidecars; Zstd; NeoEncrypt / AES; mint/stamp **without** requiring `manifest.json`; apply §7.5; extract after hard integrity mismatch only when explicitly opted out |
| NeoZip recipient / Pro tools | Discover `ACCESS.NZIP`, unwrap ECIES for a matching private key, decrypt content (§9.3 / **+Access**); Merkle still excludes `META-INF/**` |
| ZipWiki tools | Prefer `manifest.json` + `ai.root` → `parsed/` and optional `okf/`; honor `sourceIncluded: false` |
| AI agents | Prefer `META-INF/manifest.json` when present (L4), then OKF index / per-primary concepts and/or `parsed/` as declared |

---

## 13. Specification versioning and publication

| Change type | Impact | Examples |
| :---- | :---- | :---- |
| Additive | Minor | New optional `ai` fields, new reserved Extra Field IDs |
| Breaking | Major | AI root rename policy change, merkle algorithm change |

When present, archives declare `specVersion` in `META-INF/manifest.json`.
Readers **SHOULD** best-effort older versions rather than refuse. Absence of
`manifest.json` does not affect L1–L3 validity.

Core crypto (L1–L3) and recipient access (**+Access**) remain compatible with
NeoZipKit Application Note **0.1.1** for Merkle algorithms, Extra Fields,
sidecars (including `ACCESS.NZIP`), compression method **93**, and NeoEncrypt /
WinZip AES wire forms.

| Resource | URL |
| :---- | :---- |
| Current Application Note | [https://neozip.io/spec/appnote](https://neozip.io/spec/appnote) |
| Version history | [https://neozip.io/spec/appnote/history](https://neozip.io/spec/appnote/history) |
| This package AppNote (synced from ZipWiki) | `packages/neozipkit/NEOZIP_APPNOTE.md` |
| ZipWiki AI extensions | [ZIPWIKI_APPNOTE.md](https://github.com/NeoWareInc/format-specs/blob/main/ZIPWIKI_APPNOTE.md) |
| NeoZipKit core profile (0.1.1) | Historical kit profile superseded by this 0.2.0-draft note |

---

## 14. Change log

While **0.2.0** remains a draft, keep a **single** summary row for it. Do not
append minor edit rows. When the draft is finalized, that row becomes the
released change summary since **0.1.1**.

| Date | Version | Change |
| :---- | :---- | :---- |
| 2026-09-02 | **0.2.0-draft** | **Working summary of changes since 0.1.1** (replace this text when the draft is complete): ZipWiki packaging on the NeoZip core profile — AI roots `wiki/` (default) / `ai/` / `context/` with optional `parsed/` and optional `okf/`; **per-primary OKF concepts** `{stem}.md` + `index.md` (legacy package-level `document.md` still valid); OKF `sources` are package-relative from `{R}/okf/`; OKF **MAY** cite primaries with no parse; packages **MAY** omit OKF entirely; **`ai.primaries[].sourceIncluded: false`** for extract-only / omit-original document formats; Extra Field **`0x014F` v1 TLV** original attributes (optional URI, CRC-32, uint64 size, int64 Unix mtime, optional SHA-256 of original primary bytes as tag `0x05`; field version stays 1 until first release); ZipWiki default integrity is ZIP CRC-32 (Extra Field `0x014E` and Merkle root values are opt-in / blockchain-only); `META-INF/manifest.json` as an advanced features control surface (not AI-exclusive; global MUST fields `format` / `specVersion` / `createdAt`; recommended minimum `specVersion` `"0.1.1"`, ZipWiki AI-root packages at least `"0.2.0"`; `ai` registry only when AI materials exist); L4 ZipWiki AI conformance; L1–L3 and **+Access** remain independent of the manifest; inherits 0.1.1 crypto/chain (Merkle v1/v0, Extra Fields, `ACCESS.NZIP`, Zstd, NeoEncrypt / WinZip AES). See (historical 0.1.1, not in this repo) for the 0.1.x baseline. |
| 2026-08-14 | 0.1.1 | NeoZipKit core: `ACCESS.NZIP` recipient / hybrid encryption. See (historical 0.1.1, not in this repo) §13. |
| 2026-08-09 | 0.1.0 | NeoZipKit core: initial release / NeoEncrypt default. See (historical 0.1.1, not in this repo) §13. |
