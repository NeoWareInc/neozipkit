#!/usr/bin/env bash
# Manual fallback: publish both packages to npm in dependency order.
# Prefer the automated GitHub Actions workflow (push a v* tag) over this script.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building all packages..."
yarn build

echo ""
echo "Publishing neozipkit..."
cd packages/neozipkit
npx --yes npm@11 publish --access public
cd ../..

echo ""
echo "Publishing neozip-blockchain..."
cd packages/neozip-blockchain
npx --yes npm@11 publish --access public
cd ../..

echo ""
echo "Done. Both packages published."
