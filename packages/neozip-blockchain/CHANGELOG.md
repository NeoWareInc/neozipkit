# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0-beta.1] - 2026-03-03

- Beta pre-release of 0.6.0 for npm (unscoped `neozip-blockchain`). Same changes as [0.6.0]; install with `npm install neozip-blockchain@beta`.

## [0.6.0] - 2026-03-03

**Stable release.** Same content as 0.6.0-beta.1; now the default on npm.

### Added

- **NZIP contract v2.51** — Base Sepolia now uses v2.51 (digest-only identity, no composite key). Contract address: `0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77`
- **token-direct example** — Interactive prompt: 1) Use existing token, 2) Mint a new token, 3) Cancel; option to abort before minting
- **Verify examples** — Display contract version (e.g. v2.51) in verification output

### Changed

- **CONTRACT_CONFIGS** — Base Sepolia (84532) updated from v2.50 to v2.51
- **Examples/docs** — References updated for v2.51 contract
- **Tests** — Contract config tests updated for v2.51; getContractAdapter and getContractAdapterByVersion coverage

## [0.5.2] - 2026-03-02

- Pre-release; changes rolled into [0.6.0].

## [0.5.0] - Initial open-source release

- Open-source companion to [neozipkit](https://www.npmjs.com/package/neozipkit) for blockchain timestamping, NFT minting, and verification
- Zipstamp server API client and helpers for stamp, upgrade, and mint workflows
- NZIP contract v2.50 as default; support for v2.11 and v2.10
- Wallet management (browser and Node.js), ZipkitMinter, ZipkitVerifier
- OpenTimestamps (OTS) add-on for Bitcoin-backed timestamps
- Examples: token-direct, stamp-zip, upgrade-zip, mint-nft, verify-zip, token-create, OTS stamp/verify
- Peer dependency: neozipkit >0.5.0

[0.5.0]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.5.0
[0.5.2]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.5.2
[0.6.0]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.6.0
[0.6.0-beta.1]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.6.0-beta.1
