# Releasing NeoZipKit to npm

Publish **from your machine** using the **current version** in `package.json`. No version bump, no CI. Whatever is in `package.json` (e.g. `0.5.0`) is what gets published.

## Prerequisites

- Publish access to `@neozip/neozipkit` on npm (NeoWare org).
- npm logged in on your machine (`npm whoami` to check).

---

## Release the current version (e.g. 0.5.0)

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
- `--access public` is required for scoped packages like `@neozip/neozipkit` (first publish or to keep it public).

### 4. Verify

- [npm package](https://www.npmjs.com/package/@neozip/neozipkit) should show **0.5.0** (or whatever version you had).
- Install: `npm install @neozip/neozipkit@0.5.0`

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
| **402 / 403 on publish** | Run `npm login`. For scoped packages use `npm publish --access public`. |
| **Version 0.5.0 already exists** | That version is already on npm. Either publish a new version (bump first) or use a different version number. |
| **Not logged in** | `npm login` and retry. |
