#!/bin/bash
# Alternative publish script using npm login (handles 2FA interactively)
# Use this when tokens don't work with 2FA

set -e

echo "🚀 Publishing neozipkit v0.3.1 to npm..."
echo ""
echo "⚠️  This will use npm login which will prompt for 2FA"
echo ""

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

# Login (will prompt for username, password, email, and 2FA)
echo ""
echo "🔐 Logging into npm (you'll be prompted for credentials and 2FA)..."
npm login

# Verify login worked
if ! npm whoami &> /dev/null; then
    echo "❌ Login failed!"
    exit 1
fi

echo "✅ Logged in as: $(npm whoami)"
echo ""

# Publish
echo "📤 Publishing to npm..."
npm publish

echo ""
echo "✅ Published neozipkit@$VERSION to npm!"
echo "🔗 https://www.npmjs.com/package/neozipkit"

