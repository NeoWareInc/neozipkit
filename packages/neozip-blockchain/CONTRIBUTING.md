# Contributing to neozip-blockchain

Contributions are welcome. This project follows the same contributing approach as [neozipkit](https://www.npmjs.com/package/neozipkit). Please follow the guidelines below.

## Development setup

1. Clone the repository and install dependencies:

   ```bash
   yarn install
   # or: npm install
   ```

2. Install the peer dependency [neozipkit](https://www.npmjs.com/package/neozipkit) (version `>0.5.0`) for examples and tests:

   ```bash
   yarn add neozipkit
   # or: npm install neozipkit
   ```

3. Make changes to TypeScript files in `src/`.
4. Run `yarn build` for production build (or `npm run build`).
5. Test changes using the examples (e.g. `yarn example:token-direct`, `yarn example:verify-token`).
6. Commit only source files, not generated files (e.g. do not commit `dist/`).

## Making changes

- Edit TypeScript files in `src/` directories.
- Update exports in `src/index.ts` (and relevant subpath entry points) if adding new public modules.
- Update `package.json` `exports` if creating new public entry points.
- Run the build process to generate JavaScript: `yarn build`.
- Run unit tests: `yarn test` or `yarn test:unit`.
- Test using examples before submitting PRs.

## Build and test

- **Build:** `yarn build` (or `npm run build`) — compiles TypeScript to `dist/`.
- **Unit tests:** `yarn test` or `yarn test:unit` (or `npm run test`).
- **Watch tests:** `yarn test:watch`.

Ensure the build and tests pass before submitting a PR.

## Submitting PRs

1. Open an issue or comment on an existing one if the change is non-trivial.
2. Create a branch, make your changes, and keep the scope focused.
3. Run `yarn build` and `yarn test`; fix any failures.
4. Open a pull request with a clear description. Link any related issues.

## Reporting issues

Open a [GitHub issue](https://github.com/NeoWareInc/neozip-blockchain/issues) for bugs or feature requests. Include steps to reproduce for bugs and your environment (Node version, OS) where relevant.

## Code of conduct

Be respectful and constructive. By participating, you agree to uphold a welcoming environment for everyone.

## Version and release

- The package version lives in `package.json`. Keep the exported `VERSION` constant in `src/index.ts` in sync when cutting a release (see README and release checklist).
