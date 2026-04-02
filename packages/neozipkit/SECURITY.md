# Security

Security considerations for NeoZipKit and how to report vulnerabilities.

## Scope of this package

NeoZipKit handles ZIP creation, compression, and encryption only. It does **not** handle blockchain keys, wallets, or smart contracts. For wallet and key security when using blockchain features, see **[neozip-blockchain](https://github.com/NeoWareInc/neozip-blockchain)** and its security documentation.

## Encryption and passwords

### ZIP encryption passwords

When using password-protected ZIP encryption:

- **Do not hardcode passwords** in source code or config committed to version control.
- Prefer **environment variables** or **secure input** (e.g. prompt, secrets manager) for encryption passwords.
- Use **strong passwords** (sufficient length and entropy) for sensitive archives.
- Restrict **file and process access** to decrypted content so only intended users or services can read it.

### Example (avoid)

```typescript
// ❌ Do not hardcode
const password = 'mySecretPassword123';
await zip.createZipFromFiles(files, 'out.zip', { password });
```

### Example (prefer)

```typescript
// ✅ Use environment or secure input
const password = process.env.ARCHIVE_PASSWORD;
if (!password) throw new Error('ARCHIVE_PASSWORD not set');
await zip.createZipFromFiles(files, 'out.zip', { password });
```

## General practices

- **Secrets**: Do not commit `.env`, keys, or credentials. Use `.gitignore` and `.npmignore` (this repo already excludes `.env`, `wallet/`, `*.key`, `*.pem`, `secrets/`).
- **Dependencies**: Keep dependencies up to date and run `yarn npm audit` (or `npm audit`) regularly; fix high/critical issues before release.
- **Inputs**: Validate paths and options when creating or extracting archives (e.g. path traversal, very large inputs) in your application layer.
- **Integrity**: Use the library’s hash/CRC options where appropriate to verify archive contents after extraction.

## Reporting a vulnerability

If you find a security vulnerability:

1. **Do not** open a public GitHub issue.
2. Report it privately (e.g. **GitHub Security Advisories** for this repo, or contact the maintainers as stated in the repo).
3. Allow time for a fix before any public disclosure; follow responsible disclosure practices.

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) – Web application security risks
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/) – Secure Node.js usage
