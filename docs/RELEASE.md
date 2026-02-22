# Releasing NeoZipKit to npm

Publish **from your machine** using the **current version** in `package.json`. No version bump, no CI. Whatever is in `package.json` (e.g. `0.5.0`) is what gets published.

## Prerequisites

- Publish access to `neozipkit` on npm (NeoWare org).
- npm logged in on your machine (`npm whoami` to check).
- **Two-factor authentication (2FA)** enabled on your npm account, **or** an **automation token** with “Bypass 2FA for publish” (required by npm to publish packages).

---

## Release the current version (e.g. 0.5.0)

### 0. Log in to npm (do this first)

If you see “Access token expired or revoked” or 404 on publish, you are not logged in:

```bash
npm login
```

- Username: your npm username  
- Password: your npm password **or** an [Automation token](https://www.npmjs.com/settings/~/tokens) (if you use token-as-password)  
- Email: your email  
- If 2FA is on: enter the one-time code when prompted  

When npm says “Logged in as …”, run the steps below. **If you skip login, publish will fail with 404.**

### 1. Confirm version

Check that `package.json` has the version you want to publish:

```bash
node -p "require('./package.json').version"
# e.g. 0.5.0
```

No need to bump. To publish as **0.5.0**, leave it at **0.5.0**.

### 2. Build

```bash
yarn install
yarn build
```

### 3. Publish to npm

From the repo root, either:

```bash
npm publish --access public
```

or (build + publish in one step):

```bash
yarn release
```

- npm publishes the version from `package.json` (e.g. **0.5.0**).
- `--access public` is required for scoped packages like `neozipkit` (first publish or to keep it public).

### 4. Verify

- [npm package](https://www.npmjs.com/package/neozipkit) should show **0.5.0** (or whatever version you had).
- Install: `npm install neozipkit@0.5.0`

---

## Optional: tag in git after publishing

After a successful publish you can record the release in git:

```bash
git tag v0.5.0
git push origin v0.5.0
```

No need to commit anything if you didn’t change the version.

---

## When you do want to release a new version later

1. Bump in `package.json`: run `yarn version:patch` (or `version:minor` / `version:major` / `node scripts/update-version.js 0.6.0`).
2. Then follow the same steps above: build → `npm publish --access public`.

---

## Troubleshooting

| Issue | What to do |
|--------|------------|
| **“Access token expired or revoked” + 404 Not Found** | Your npm login token is invalid or expired. npm then often returns 404 instead of 401, so it looks like the package is “not in this registry”—but the real issue is auth. **Fix:** Run `npm login` again (use your password + 2FA code, or an automation token as the password). Then run `npm publish --access public` again. |
| **403 Forbidden – “Two-factor authentication or granular access token with bypass 2fa enabled is required”** | npm requires 2FA or an automation token to publish. **Option A:** Enable 2FA on your npm account: [npm → Account → Enable 2FA](https://www.npmjs.com/settings/~/account). Then run `npm publish --access public` again (npm will prompt for your OTP). **Option B:** Use an automation token: [npm → Access Tokens → Generate](https://www.npmjs.com/settings/~/tokens), create a token with “Automation” or “Publish” and “Bypass 2FA for publish”, then `npm login` and paste the token as password. |
| **402 / 403 on publish** | Run `npm login`. For scoped packages use `npm publish --access public`. Ensure 2FA or an automation token is set up (see above). |
| **Version 0.5.0 already exists** | That version is already on npm. Either publish a new version (bump first) or use a different version number. |
| **Not logged in** | `npm login` and retry. |
