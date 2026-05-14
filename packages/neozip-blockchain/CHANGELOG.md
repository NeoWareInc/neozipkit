# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Email verification delivery** — `registerEmail` and `TokenServiceClient.register` support `verificationDelivery`: `browser` (default) or `app`, matching NeoZip Token Service `POST /auth/register`. Optional env `TOKEN_SERVICE_VERIFICATION_DELIVERY`; `yarn verify-email` accepts `--browser`, `--app`, or `--delivery=…`. Helper `parseVerificationDeliveryInput` exported from `neozip-blockchain/token-service`.

### Breaking

- **NeoZip Token Service client** — The HTTP client module lives at [`src/token-service/`](src/token-service/) with exports such as `TokenServiceClient`, `getTokenServiceUrl`, and `DEFAULT_TOKEN_SERVICE_URL`. The npm subpath is `neozip-blockchain/token-service`. Configuration uses `TOKEN_SERVICE_URL`, `TOKEN_SERVICE_EMAIL`, `TOKEN_SERVICE_CHAIN_ID`, `TOKEN_SERVICE_VERIFICATION_DELIVERY` (optional register email layout), and `TOKEN_SERVICE_DEBUG` only. The library default base URL is `https://testnet.token-service.neozip.io`.
- **REST paths unchanged** — HTTP routes (`/stamp`, `/verify`, `/auth/register`, etc.) match the current NeoZip Token Service; update the client when the service publishes new paths.
- **Examples** — The yarn script `example:token-srv` was renamed to `example:token-service` (`token-create.ts` flow).
- **Examples** — `example:token-direct` / `examples/token-direct.ts` renamed to `example:token` / `examples/token.ts`; default output is `examples/output/token.nzip`.

### External verification (outside this repo)

Search downstream repos and CI for older `neozip-blockchain` subpath imports, renamed symbols, and outdated environment variable names. Smoke-test register/verify email, stamp, verify, batch status, NFT prepare-mint, and health against your deployed `TOKEN_SERVICE_URL`.

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
- NeoZip Token Service API client and helpers for stamp, upgrade, and mint workflows
- NZIP contract v2.50 as default; support for v2.11 and v2.10
- Wallet management (browser and Node.js), ZipkitMinter, ZipkitVerifier
- OpenTimestamps (OTS) add-on for Bitcoin-backed timestamps
- Examples: token-direct, stamp-zip, upgrade-zip, mint-nft, verify-zip, token-create, OTS stamp/verify
- Peer dependency: neozipkit >0.5.0

[0.5.0]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.5.0
[0.5.2]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.5.2
[0.6.0]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.6.0
[0.6.0-beta.1]: https://github.com/NeoWareInc/neozip-blockchain/releases/tag/v0.6.0-beta.1
