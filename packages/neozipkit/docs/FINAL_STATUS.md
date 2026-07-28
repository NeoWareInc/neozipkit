# Historical note: Zstd WASM queue (superseded)

This document described a **temporary** fix that queued operations through
`@oneidentity/zstd-js` WASM (`ZstdManager`) to avoid shared-heap corruption.

## Current status (2026-07)

That approach is **removed**. NeoZipKit now uses:

- **Node:** native `zlib` ZSTD Transform streaming (`ZstdNode`) — standard libzstd frames
- **Browser:** no zstd codec (Deflate / Stored only); stub throws if `useZstd` is requested
- **Legacy WASM frames:** detect with `LegacyZstd` / `detectLegacyZstdEntries`; extract truncates the +18 zero pad

See [ZSTD_USAGE.md](./ZSTD_USAGE.md) for current usage and interop notes.

Do not reintroduce `@oneidentity/zstd-js` or `ZstdManager`.
