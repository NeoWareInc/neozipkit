#!/usr/bin/env bash
# Dry-run npm publish for both packages with clear section headers.
# Run from monorepo root: pnpm publish:dry-run

set -euo pipefail
cd "$(dirname "$0")/.."

summarize_docs() {
  local pkg="$1"
  echo ""
  echo "── Top-level docs in ${pkg} tarball ──"
  # npm publish --dry-run prints "npm notice <size> <path>"; keep package-root markdown/license only
  grep -E 'npm notice [0-9].+\.(md|txt)|npm notice [0-9].+LICENSE' || true
}

echo "=========================================="
echo " Dry-run: neozipkit"
echo "=========================================="
(
  cd packages/neozipkit
  # Capture full npm output; show it, then highlight root docs
  out="$(npm publish --access public --dry-run 2>&1)" || { echo "$out"; exit 1; }
  echo "$out"
  echo "$out" | summarize_docs "neozipkit"
  if ! echo "$out" | grep -q 'NEOZIP_APPNOTE.md'; then
    echo "ERROR: NEOZIP_APPNOTE.md missing from neozipkit tarball" >&2
    exit 1
  fi
)

echo ""
echo "=========================================="
echo " Dry-run: neozip-blockchain"
echo "=========================================="
(
  cd packages/neozip-blockchain
  out="$(npm publish --access public --dry-run 2>&1)" || { echo "$out"; exit 1; }
  echo "$out"
  echo "$out" | summarize_docs "neozip-blockchain"
)

echo ""
echo "=========================================="
echo " Dry-run complete (both packages)"
echo "=========================================="
echo "  neozipkit         → includes NEOZIP_APPNOTE.md, WHATS_NEW.md, README.md"
echo "  neozip-blockchain → includes WHATS_NEW.md, README.md, LICENSE"
echo "  (APPNOTE lives only in the neozipkit package.)"
