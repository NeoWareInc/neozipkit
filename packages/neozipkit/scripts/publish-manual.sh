#!/bin/bash
# Manual npm publish script for v0.3.1
# Run this when GitHub Actions isn't working

set -e

echo "🚀 Publishing neozipkit v0.3.1 to npm..."

# Check if logged into npm
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged into npm. Please run: npm login"
    exit 1
fi

# Verify version
VERSION=$(node -p "require('./package.json').version")
echo "📦 Version: $VERSION"

if [ "$VERSION" != "0.3.1" ]; then
    echo "⚠️  Warning: package.json version is $VERSION, expected 0.3.1"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Verify dist exists
if [ ! -d "dist" ]; then
    echo "❌ dist/ directory not found. Building..."
    yarn build
fi

# Check if version already exists on npm
echo "🔍 Checking if version already exists on npm..."
if npm view "neozipkit@$VERSION" version &> /dev/null; then
    echo "⚠️  Version $VERSION already exists on npm!"
    read -p "Publish anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Publish
echo "📤 Publishing to npm..."
npm publish

echo "✅ Published neozipkit@$VERSION to npm!"
echo "🔗 https://www.npmjs.com/package/neozipkit"

