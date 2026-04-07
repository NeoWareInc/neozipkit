# neozipkit

Monorepo for NeoZip packages — advanced ZIP file creation, compression, encryption, and blockchain integration.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`neozipkit`](packages/neozipkit/) | ZIP compression, encryption (AES-256, NeoEncrypt), and extraction | [neozipkit](https://www.npmjs.com/package/neozipkit) |
| [`neozip-blockchain`](packages/neozip-blockchain/) | Blockchain features: NFT minting, verification, timestamps, wallets | [neozip-blockchain](https://www.npmjs.com/package/neozip-blockchain) |

## Examples

ZIP-focused sample scripts live under [`packages/neozipkit/examples/`](packages/neozipkit/examples/). They are **not** included in the [`neozipkit`](https://www.npmjs.com/package/neozipkit) npm tarball (only `dist/`, `src/`, and `README.md` are published); clone this repository to run them. Blockchain-oriented examples are under [`packages/neozip-blockchain/examples/`](packages/neozip-blockchain/examples/) (also repo-only).

## Getting started

```bash
# Install all dependencies (Yarn 4 workspaces)
yarn install

# Build all packages (topological order: neozipkit first)
yarn build

# Run unit tests for all packages
yarn test:unit
```

## Version management

Both packages share the same version number. Use the root scripts to bump:

```bash
yarn version:patch   # 0.7.0 → 0.7.1
yarn version:minor   # 0.7.0 → 0.8.0
yarn version:major   # 0.7.0 → 1.0.0
yarn version:set 1.0.0
```

## Release (automated npm publish)

Publishing is handled by [`.github/workflows/publish.yml`](.github/workflows/publish.yml): on push of a tag `v*` (e.g. `v0.7.1`), CI builds, tests, publishes **`neozipkit`** then **`neozip-blockchain`** to npm, and opens a GitHub Release.

### One-time GitHub setup

1. **Deployment environment (required for the real publish job)**  
   GitHub → repo **Settings** → **Environments** → **New environment** → name: **`npm-publish`** → **Configure environment**.  
   Optional: enable **Required reviewers**, **Wait timer**, or **Deployment branches** so only you (or `main` / `dev`) can publish.

2. **Authentication** (pick **one** path — not both at once unless you know why):

   **A — Trusted Publishing (OIDC, no token in GitHub)**  
   - On [npmjs.com](https://www.npmjs.com), for **each** package (`neozipkit`, `neozip-blockchain`): **Package** → **Settings** → **Trusted publishers** → **GitHub Actions** → this repo, workflow file **`publish.yml`**, environment name **`npm-publish`** (must match the workflow).  
   - Do **not** create a secret named `NPM_TOKEN` for this path (leave it unset so the job uses OIDC).  
   - Requires Node **≥ 22.14** in the workflow (already set). See [npm: Trusted publishers](https://docs.npmjs.com/trusted-publishers).

   **B — Classic `NPM_TOKEN` (automation or granular publish token)**  
   - Create a token on npm: [Access tokens](https://www.npmjs.com/settings/~/tokens) → **Generate New Token** — use a **Granular access token** with **Publish** on both packages, or a **Classic** **Automation** token with publish rights.  
   - Store it in GitHub in **one** of these places (the publish job uses `environment: npm-publish`, so either works):
     - **Recommended:** **Settings** → **Environments** → **`npm-publish`** → **Environment secrets** → **Add secret** → name **`NPM_TOKEN`** → paste the token.  
     - **Alternative:** **Settings** → **Secrets and variables** → **Actions** → **Repository secrets** → **New repository secret** → name **`NPM_TOKEN`** → paste the token.  
   - The workflow passes this value to **`NODE_AUTH_TOKEN`** and **`YARN_NPM_AUTH_TOKEN`** for `yarn npm publish`.  
   - If you add `NPM_TOKEN`, you are using classic auth; you do not need Trusted Publishing configured for CI (you can still use it later and then remove the secret).

   **Where things live in the GitHub UI (current layout)**  
   - **Repository** secrets & variables: **Settings** → **Secrets and variables** → **Actions** (tabs **Secrets** / **Variables**).  
   - **Environment** secrets & variables: **Settings** → **Environments** → select **`npm-publish`** → **Environment secrets** / **Environment variables**.

### Release steps

1. Bump both package versions: `yarn version:patch` (or `version:minor` / `version:major`).
2. Commit and tag: `git commit -am "release: v0.7.1" && git tag v0.7.1`.
3. Push branch and tags: `git push origin <branch> && git push origin v0.7.1`.
4. The tag **must** match `version` in both `packages/neozipkit/package.json` and `packages/neozip-blockchain/package.json` (the workflow enforces this).

### Dry run (no publish)

**In GitHub (manual trigger):**

1. Open the repo → **Actions** (top bar).
2. In the **left sidebar**, under “All workflows”, click **Publish** (that name comes from `name: Publish` in [`.github/workflows/publish.yml`](.github/workflows/publish.yml)).  
   If the sidebar is collapsed, use **Actions** → **All workflows** and select **Publish** from the list.
3. Click **Run workflow** (right side) → choose branch (usually **`main`** or **`dev`**) → leave **npm_dry_run** checked → **Run workflow**.

**If “Publish” does not appear:** GitHub only shows **Run workflow** for `workflow_dispatch` when that workflow file exists on the repository **default branch** (often `main`). Merge or push [`.github/workflows/publish.yml`](.github/workflows/publish.yml) to `main`, then refresh **Actions**. Also confirm **Settings** → **General** → **Actions** → **Actions permissions** allows workflows.

**Locally (same checks, no GitHub UI):**

```bash
yarn install --immutable && yarn build && yarn test:quick
yarn workspace neozipkit run publish:dry-run
yarn workspace neozip-blockchain run publish:dry-run
```

### Manual fallback

From the monorepo root: `yarn publish:all` (requires local `npm login` / token).

## License

MIT — Copyright (c) NeoWare, Inc.
