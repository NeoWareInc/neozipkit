# What’s New in neozip-blockchain

Release notes for people who install and use **`neozip-blockchain`** from npm (alongside [`neozipkit`](https://www.npmjs.com/package/neozipkit)).

## 2.0.0 (unreleased)

### Breaking changes

- **OpenTimestamps removed.** The `neozip-blockchain/ots` subpath export, `src/ots/` (`ZipkitOTS`), the `opentimestamps` dependency, the `TS_SUBMIT_OTS` / `TIMESTAMP_OTS` metadata constants, and the `example:ots-stamp` / `example:ots-verify` examples are gone. Use NeoZip Token Service timestamping instead: `META-INF/TS-SUBMIT.NZIP` (pending) and `META-INF/TIMESTAMP.NZIP` (confirmed).
- **Peer dependency:** `neozipkit@^1.6.0` (was `^1.5.0`).
- **Engines:** Node.js `>=22.15.0`.

```bash
npm install neozipkit@^1.6.0 neozip-blockchain@^2.0.0
```

### New: archive-level flows (`neozip-blockchain/archive`)

Path-based stamping, upgrading, minting and verification for **any** ZIP (including ZipWiki `.zipwiki` packages). No `ZipkitLike` is needed: the v1 Merkle root comes from neozipkit's `ZipReaderNode` + `computeMerkleRootFromReader` (every flow also accepts a precomputed `merkleRoot`), and sidecars are written with `applyMetaSidecars`, so content members (and `0x014F`) stay byte-identical.

- `stampArchive(path, { email, merkleRoot?, chainId?, network?, serverUrl?, write?, force? })` — submit the root, write `META-INF/TS-SUBMIT.NZIP`. Refuses to drop a `TIMESTAMP`/`TOKEN` bound to the same root unless `force`.
- `upgradeTimestamp(path, { wait?, timeoutMs?, pollIntervalMs?, serverUrl? })` — `TS-SUBMIT` → `TIMESTAMP.NZIP` once confirmed (`'confirmed' | 'pending' | 'already-confirmed' | 'none'`). Rejects a submit whose root no longer matches the content.
- `mintTimestampProof(path, { walletPrivateKey, accessToken?, network?, rpcUrl? })` — requires `TIMESTAMP.NZIP`; `prepareMint` + `mintWithTimestampProof`; writes `TOKEN.NZIP`, removes `TS-SUBMIT`, keeps `TIMESTAMP`. Reuses an existing token if the digest is already minted.
- `mintDirect(path, { walletPrivateKey, network, merkleRoot? })` — wallet mint via `ZipkitMinter`, writes `TOKEN.NZIP`.
- `verifyArchive(pathOrReader, { online?, rpcUrlIndex?, serverUrl?, merkleRoot? })` → `{ kind: 'none'|'submit'|'timestamp'|'token', merkle: { algorithm?, security?, match, root? }, status, details? }`. Offline by default (Merkle binding + embedded timestamp proof); `online` also asks the Token Service / `ZipkitVerifier`. Tampered content yields `match: false` (`merkle-mismatch` / `integrity-error`), never an exception.
- Sidecars (`neozip-blockchain/sidecars`, also re-exported from `./archive`): `buildSubmitSidecar`, `buildTimestampSidecar`, `buildTokenSidecar`, `writeSidecars(path, { add?, remove?, updateProfiles? })`. Per AppNote §8.4/§8.6, adding `TS-SUBMIT` removes `TIMESTAMP`/`TOKEN`; adding `TIMESTAMP` or `TOKEN` removes `TS-SUBMIT`. If `manifest.json` exists, `profiles` `"timestamped"` / `"tokenized"` are kept in sync (a manifest is never created for you).
- `loadNeozipConnection({ dir? })` (`neozip-blockchain/node`) — reads `NEOZIP_RECIPIENT_EMAIL`, `NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN`, `NEOZIP_WALLET_PASSKEY`, `TOKEN_SERVICE_URL`, `TOKEN_SERVICE_NETWORK`; fills email / network / URL from the CLI store's public `public.json` when unset. The encrypted `secrets.enc` is not decrypted and the macOS keychain is never touched; use env vars for the access token and wallet key.

The package root exports only the pure sidecar builders and the flow types; import the flows from `neozip-blockchain/archive` (it loads `ethers` and `neozipkit/node`).

---

## 1.5.0 (2026-10-25)

Released with sibling **`neozipkit@1.5.0`** (Zip64, Extra Field `0x014F`, browser/buffer zstd, `forceZip64`).

### Identity-based (recipient) encryption

Moved from the former private `@neowareinc/neozipkit-pro` package into this library:

- **`neozip-blockchain/encryption`** — ECIES key wrapping (secp256k1 / X25519 + AES-256-GCM), `META-INF/ACCESS.NZIP`, `encryptForRecipients` / `decryptAsRecipient`
- **`neozip-blockchain/identity`** — ENS / address / Lit PKP resolvers for recipient public keys

Inner ZIP entry encryption still uses **neozipkit** NeoEncrypt (`neo-aes256`) by default. See [docs/ENCRYPTION.md](docs/ENCRYPTION.md).

HKDF domain-separation strings are unchanged (`neozipkit-pro/ecies/v1`, …) so existing recipient-encrypted archives remain decryptable.

```bash
npm install neozipkit@^1.5.0 neozip-blockchain@^1.5.0
```

```typescript
import { encryptForRecipients } from 'neozip-blockchain/encryption';
import { ENSResolver } from 'neozip-blockchain/identity';
```

---

## 1.0.5 (2026-08-14)

### Token Service network profiles (Base Sepolia + Base Mainnet)

- Dual Token Service hostnames: testnet → `https://testnet.token-service.neozip.io` (Base Sepolia, **default**); production → `https://token-service.neozip.io` (Base Mainnet).
- Library APIs: `resolveNetworkProfile`, `getTokenServiceUrlForNetwork`, `NETWORK_PROFILES`, `isTokenPurchaseAvailable` (stub; always `false` — purchase coming soon).
- Prefer env `TOKEN_SERVICE_NETWORK=base-sepolia|base`; `TOKEN_SERVICE_CHAIN_ID` still works; `NEOZIP_CHAIN_ID` is a deprecated alias.
- Base Mainnet NFT in `CONTRACT_CONFIGS[8453]` is **v2.51** at `0x13C7c45FA99856153AeD9e97d6Db8bDEc5320E42` with TimestampReg v0.90 at `0x07A6a71444A974a7DcfC185966e56fF4809B39f4`. Historic v2.10: `LEGACY_BASE_MAINNET_NFT_V210`.

### Membership helpers (Token Service)

`TokenServiceClient` supports membership-gated routes (Bearer access token):

- `getMembershipStatus()` — `GET /membership/status`
- `createMembershipCheckout(...)` — `POST /membership/checkout` (Stripe Checkout URL)
- `createMembershipPortal()` — `POST /membership/portal` (Stripe Customer Portal)

Structured errors can surface `membershipRequired` when a network needs an active membership.

### APPNOTE-aligned META-INF discovery + Merkle §6.3

Requires **`neozipkit@^1.0.5`**.

- Token and timestamp sidecar lookup follows [NEOZIP_APPNOTE.md](https://github.com/NeoWareInc/neozipkit/blob/main/packages/neozipkit/NEOZIP_APPNOTE.md) §2.3 (canonical uppercase writes; **ASCII case-insensitive** discovery).
- Mint / stamp / verify helpers prefer **`getMerkleRootAsync()`** so digests match APPNOTE **§6.3** (domain-separated content leaves, path-normalized sort; stream leaves when the kit captured them). Sync `getMerkleRoot()` alone is not enough for new v1 roots when only Extra Field digests are present.

**Helpers:** `getMerkleRootSafeAsync(zip)` (preferred), `getMerkleRootSafe(zip)` (sync only).

Legacy digests can still be checked with digests-based **`{ algorithm: 'v0' }`** roots / fallbacks.

```bash
npm install neozipkit@^1.0.5 neozip-blockchain@^1.0.5
```

---

## 1.0.2 (2026-07-28)

### First stable release

**1.0.2** is the first non-beta release. From here on, this package follows [Semantic Versioning](https://semver.org/).

Install with a matching NeoZipKit:

```bash
npm install neozipkit@^1.0.2 neozip-blockchain@^1.0.2
```

---

## 0.8.0 (2026-06-30)

### Token Service helpers (account, funding, identity)

New modules under the `neozip-blockchain/token-service` export for talking to a NeoZip Token Service:

- **Account / auth** — register and verify email (`browser` or `app` delivery), magic-link exchange, wallet login challenge/response, phone OTP.
- **Funding** — read funding policy/status and request a native-gas grant for the primary Data Wallet.
- **Identity** — wallet ensure/attach challenges and encrypted identity-key registration helpers.
- **HTTP utilities** — URL normalization, JSON parsing, auth error messages, access-token expiry parsing.

These APIs are **stateless**: your app stores tokens and decides how to recover from 401/403.

### Email verification delivery

When registering, choose how the verification email is sent:

- `browser` (default) — web confirm link + code (good for scripts and CLI).
- `app` — app-style deep link.

Set `TOKEN_SERVICE_VERIFICATION_DELIVERY`, or pass `verificationDelivery` / `--browser` / `--app` in the verify-email example.

### Breaking changes (Token Service client)

- Import from **`neozip-blockchain/token-service`** (`TokenServiceClient`, `getTokenServiceUrl`, `DEFAULT_TOKEN_SERVICE_URL`, …).
- Configure with **`TOKEN_SERVICE_URL`**, **`TOKEN_SERVICE_EMAIL`**, **`TOKEN_SERVICE_CHAIN_ID`**, optional **`TOKEN_SERVICE_VERIFICATION_DELIVERY`**, **`TOKEN_SERVICE_DEBUG`**.
- Default server: `https://testnet.token-service.neozip.io`.
- Example script renames: `example:token-service`, `example:token` (output `token.nzip`).

You must also install **`neozipkit`** yourself (peer dependency). It is not bundled inside this package.

---

## 0.6.0 (2026-03-03)

- **NZIP contract v2.51** on Base Sepolia (digest-only identity): `0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77`
- Verify flows show the contract version (e.g. v2.51)
- Token example can reuse an existing token or mint a new one

*(0.6.0-beta.1 was the same content as a beta npm tag.)*

---

## 0.5.0 — Initial open-source release

- Companion to NeoZipKit for timestamping, NFT minting, and verification
- NeoZip Token Service client for stamp → upgrade → mint workflows
- NZIP contracts (v2.50 default; also v2.11 / v2.10)
- Wallet helpers (browser and Node), ZipkitMinter, ZipkitVerifier
- OpenTimestamps (OTS) support for Bitcoin-backed timestamps (removed in 2.0.0)
