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

## Release

1. Bump versions: `yarn version:patch` (or minor/major).
2. Commit and tag: `git commit -m "release: v0.7.1" && git tag v0.7.1`.
3. Push: `git push origin dev --tags`.
4. GitHub Actions publishes both packages to npm and creates a GitHub Release.

## License

MIT — Copyright (c) NeoWare, Inc.
