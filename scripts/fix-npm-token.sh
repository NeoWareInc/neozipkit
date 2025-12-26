#!/bin/bash
# Fix npm token to use one of the working tokens with bypass 2FA

echo "🔧 Fixing npm token configuration..."
echo ""
echo "You have two tokens with Bypass 2FA enabled:"
echo "1. neozipkit-publish (npm_e5iZ......aHWr)"
echo "2. NeoWare (npm_SkbG......cDWt)"
echo ""
echo "Current token in ~/.npmrc: npm_WhFttt..."
echo ""
echo "⚠️  You need to update ~/.npmrc with one of the working tokens!"
echo ""
echo "Choose which token to use:"
echo "1) neozipkit-publish"
echo "2) NeoWare"
echo ""
read -p "Enter choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "📋 Copy the FULL token for 'neozipkit-publish' from npm.com"
    echo "   It should start with: npm_e5iZ"
    echo ""
    read -p "Paste the full token here: " token
elif [ "$choice" == "2" ]; then
    echo ""
    echo "📋 Copy the FULL token for 'NeoWare' from npm.com"
    echo "   It should start with: npm_SkbG"
    echo ""
    read -p "Paste the full token here: " token
else
    echo "Invalid choice"
    exit 1
fi

if [ -z "$token" ]; then
    echo "❌ No token provided"
    exit 1
fi

# Update .npmrc
echo ""
echo "🔐 Updating ~/.npmrc..."
npm config set //registry.npmjs.org/:_authToken "$token"

echo ""
echo "✅ Token updated!"
echo ""
echo "Verifying..."
if npm whoami &> /dev/null; then
    echo "✅ Logged in as: $(npm whoami)"
    echo ""
    echo "Now try publishing:"
    echo "  npm publish --access public"
else
    echo "❌ Authentication failed. Check the token."
fi

