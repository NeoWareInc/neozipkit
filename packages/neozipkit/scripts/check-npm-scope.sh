#!/bin/bash
# Check npm scope ownership and package status

echo "🔍 Checking npm scope and package status..."
echo ""

# Check if logged in
echo "1. Checking npm authentication..."
if npm whoami &> /dev/null; then
    echo "   ✅ Logged in as: $(npm whoami)"
else
    echo "   ❌ Not logged in. Run: npm login"
    exit 1
fi

echo ""
echo "2. Checking if package exists on npm..."
if npm view @neozip/neozipkit &> /dev/null; then
    echo "   ⚠️  Package @neozip/neozipkit already exists!"
    echo "   Current maintainers:"
    npm view @neozip/neozipkit maintainers 2>/dev/null || echo "   (Could not fetch maintainers)"
else
    echo "   ✅ Package does not exist yet"
fi

echo ""
echo "3. Checking scope ownership..."
echo "   Visit: https://www.npmjs.com/org/neozip"
echo "   This will show if you own the @neozip scope"
echo ""

echo "4. If you don't own @neozip scope, you need to:"
echo "   a) Create the organization at: https://www.npmjs.com/org/create"
echo "   b) Or use a different scope/package name"
echo ""

