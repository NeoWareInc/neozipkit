# What’s New in neozip-blockchain

Release notes for people who install and use **`neozip-blockchain`** from npm (alongside [`neozipkit`](https://www.npmjs.com/package/neozipkit)).

## 1.1.0

### Identity-based (recipient) encryption

Moved from the former private `@neowareinc/neozipkit-pro` package into this library:

- **`neozip-blockchain/encryption`** — ECIES key wrapping (secp256k1 / X25519 + AES-256-GCM), `META-INF/ACCESS.NZIP`, `encryptForRecipients` / `decryptAsRecipient`
- **`neozip-blockchain/identity`** — ENS / address / Lit PKP resolvers for recipient public keys

Inner ZIP entry encryption still uses **neozipkit** NeoEncrypt (`neo-aes256`) by default. See [docs/ENCRYPTION.md](docs/ENCRYPTION.md).

HKDF domain-separation strings are unchanged (`neozipkit-pro/ecies/v1`, …) so existing recipient-encrypted archives remain decryptable.

```bash
npm install neozipkit@^1.0.5 neozip-blockchain@^1.1.0
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

- Token, timestamp, and OTS sidecar lookup follows [NEOZIP_APPNOTE.md](https://github.com/NeoWareInc/neozipkit/blob/main/packages/neozipkit/NEOZIP_APPNOTE.md) §2.3 (canonical uppercase writes; **ASCII case-insensitive** discovery).
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
- OpenTimestamps (OTS) support for Bitcoin-backed timestamps
