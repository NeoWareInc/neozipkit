# What’s New in neozip-blockchain

Release notes for people who install and use **`neozip-blockchain`** from npm (alongside [`neozipkit`](https://www.npmjs.com/package/neozipkit)).

## 1.0.0 (2026-07-28)

### First stable release

**1.0.0** is the first non-beta release. From here on, this package follows [Semantic Versioning](https://semver.org/).

Install with a matching NeoZipKit:

```bash
npm install neozipkit@^1.0.0 neozip-blockchain@^1.0.0
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
