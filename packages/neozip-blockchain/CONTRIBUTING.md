# Contributing to neozip-blockchain

Contributions are welcome. This project follows the same contributing approach as [neozipkit](https://www.npmjs.com/package/neozipkit). Please follow the guidelines below.

## Development setup

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   # or: npm install
   ```

2. Install the peer dependency [neozipkit](https://www.npmjs.com/package/neozipkit) (version `>0.5.0`) for examples and tests:

   ```bash
   pnpm add neozipkit
   # or: npm install neozipkit
   ```

3. Make changes to TypeScript files in `src/`.
4. Run `pnpm build` for production build (or `npm run build`).
5. Test changes using the examples (e.g. `pnpm example:token`, `pnpm example:verify-token`).
6. Commit only source files, not generated files (e.g. do not commit `dist/`).

## Making changes

- Edit TypeScript files in `src/` directories.
- Update exports in `src/index.ts` (and relevant subpath entry points) if adding new public modules.
- Update `package.json` `exports` if creating new public entry points.
- Run the build process to generate JavaScript: `pnpm build`.
- Run unit tests: `pnpm test` or `pnpm test:unit`.
- Test using examples before submitting PRs.

## Build and test

- **Build:** `pnpm build` (or `npm run build`) — compiles TypeScript to `dist/`.
- **Unit tests:** `pnpm test` or `pnpm test:unit` (or `npm run test`).
- **Watch tests:** `pnpm test:watch`.

Ensure the build and tests pass before submitting a PR.

## Submitting PRs

1. Open an issue or comment on an existing one if the change is non-trivial.
2. Create a branch, make your changes, and keep the scope focused.
3. Run `pnpm build` and `pnpm test`; fix any failures.
4. Open a pull request with a clear description. Link any related issues.

## Reporting issues

Open a [GitHub issue](https://github.com/NeoWareInc/neozip-blockchain/issues) for bugs or feature requests. Include steps to reproduce for bugs and your environment (Node version, OS) where relevant.

## Code of conduct

Be respectful and constructive. By participating, you agree to uphold a welcoming environment for everyone.

## Version and release

- The package version lives in `package.json`. Keep the exported `VERSION` constant in `src/index.ts` in sync when cutting a release (see README and release checklist).
