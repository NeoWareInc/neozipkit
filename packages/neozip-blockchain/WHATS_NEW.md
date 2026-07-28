# What’s New in neozip-blockchain

## 1.0.0 (2026-07-28)

### First stable (non-beta) release

**1.0.0** is the first non-beta publish of `neozip-blockchain`. SemVer applies from here: breaking API changes will bump the major version.

- Peer / dev dependency on **`neozipkit@^1.0.0`**.
- Monorepo package manager is **pnpm** (workspace + lockfile); registry uploads still use `npm publish`.

---

## 0.8.0 (2026-06-30)

### Token Service account / funding / identity HTTP clients

New stateless modules under `src/token-service/`, re-exported from `neozip-blockchain/token-service`:

- **`TokenServiceAccountAuth`** — `registerEmail{App,Cli,WithDelivery}`, `verifyEmailAndExtractToken`, `exchangeMagicLinkToken`, silent SIWE-style `requestWalletLoginChallenge` / `walletLogin` (with `WalletLoginUnavailableError`), and phone OTP (`requestPhoneOtp` / `verifyPhoneOtp`).
- **`TokenServiceFunding`** — native-gas grants for the primary Data Wallet: `getFundingPolicy`, `getFundingStatus`, `requestFundingGrant` (with `FundingUnavailableError`).
- **`TokenServiceIdentity`** — wallet linking and encrypted identity-key registration HTTP primitives: `requestWalletEnsureChallenge`, `completeWalletEnsure`, `requestWalletAttachChallenge`, `completeWalletAttach`, `getIdentityKeyBundle`, `requestIdentityKeyInitChallenge`, `completeIdentityKeyInit`, `fetchCoordinatorConfig` (with `IdentityKeyConflictError`, `WrapBundle`, `IdentityKeyBundleBody`, `DEFAULT_RECIPIENT_SUITE`).
- **`http`** — shared utilities: `normalizeServerUrl`, `safeJson`, `pickString`, `extractError`, `genericAuthErrorMessage`, `parseAccessTokenExpiry`, `formatTokenServiceFetchError`. Authenticated clients attach their own `Authorization: Bearer` headers.

These helpers are persistence-free and product-agnostic: callers own token storage and may map 401/403 failures to their own recovery guidance (the library emits generic auth messages only).

### Email verification delivery

`registerEmail` and `TokenServiceClient.register` support `verificationDelivery`: `browser` (default) or `app`, matching NeoZip Token Service `POST /auth/register`. Optional env `TOKEN_SERVICE_VERIFICATION_DELIVERY`; `pnpm verify-email` accepts `--browser`, `--app`, or `--delivery=…`. Helper `parseVerificationDeliveryInput` is exported from `neozip-blockchain/token-service`.

### npm publish fix

Removed `neozipkit: "workspace:*"` from `dependencies` (npm does not rewrite the workspace protocol). Consumers install `neozipkit` via `peerDependencies`; monorepo development uses a matching semver range in `devDependencies`. `prepack` validates the manifest before pack/publish.

### Breaking

- **NeoZip Token Service client** — Lives at `src/token-service/` with exports such as `TokenServiceClient`, `getTokenServiceUrl`, and `DEFAULT_TOKEN_SERVICE_URL`. npm subpath: `neozip-blockchain/token-service`. Config env vars: `TOKEN_SERVICE_URL`, `TOKEN_SERVICE_EMAIL`, `TOKEN_SERVICE_CHAIN_ID`, `TOKEN_SERVICE_VERIFICATION_DELIVERY`, `TOKEN_SERVICE_DEBUG`. Default base URL: `https://testnet.token-service.neozip.io`.
- **Examples** — `example:token-srv` → `example:token-service`; `example:token-direct` / `token-direct.ts` → `example:token` / `token.ts` (default output `examples/output/token.nzip`).

---

## 0.6.0-beta.1 (2026-03-03)

Beta pre-release of 0.6.0 for npm (unscoped `neozip-blockchain`). Same content as 0.6.0; install with `npm install neozip-blockchain@beta`.

---

## 0.6.0 (2026-03-03)

Stable release of the 0.6 line (same content as 0.6.0-beta.1; default on npm).

### Added

- **NZIP contract v2.51** — Base Sepolia uses v2.51 (digest-only identity, no composite key). Contract address: `0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77`
- **token-direct example** — Interactive prompt: use existing token, mint a new token, or cancel
- **Verify examples** — Display contract version (e.g. v2.51) in verification output

### Changed

- **CONTRACT_CONFIGS** — Base Sepolia (84532) updated from v2.50 to v2.51
- Examples, docs, and contract-config tests updated for v2.51

---

## 0.5.2 (2026-03-02)

Pre-release; changes rolled into 0.6.0.

---

## 0.5.0 — Initial open-source release

- Open-source companion to [neozipkit](https://www.npmjs.com/package/neozipkit) for blockchain timestamping, NFT minting, and verification
- NeoZip Token Service API client and helpers for stamp, upgrade, and mint workflows
- NZIP contract v2.50 as default; support for v2.11 and v2.10
- Wallet management (browser and Node.js), ZipkitMinter, ZipkitVerifier
- OpenTimestamps (OTS) add-on for Bitcoin-backed timestamps
- Examples: stamp, upgrade, mint, verify, token, token-service, OTS stamp/verify
- Peer dependency: `neozipkit`
