# Version Management

NeoZipKit now uses a **single source of truth** for version information. All version numbers are automatically derived from `package.json`.

## 🎯 Single Source of Truth

**`package.json`** is the authoritative source for all version information:

```json
{
  "name": "neozipkit",
  "version": "0.2.1",  // ← This controls ALL version information
  ...
}
```

## 🔄 How It Works

### Dynamic Version Reading

The `src/shared/version.ts` file automatically reads from `package.json`:

```typescript
// Import package.json to get the version
import packageJson from '../../package.json';

// Get current date for release date
const currentDate = new Date();
const releaseDate = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}-${currentDate.getFullYear()}`;

export const VERSION = {
  number: packageJson.version,  // ← Always matches package.json
  date: releaseDate             // ← Auto-generated current date
};
```

### Automatic Propagation

All version references throughout the codebase automatically use this dynamic version:

- ✅ **`NEOZIPKIT_INFO.version`** - Used in all components
- ✅ **Example files** - Import from the dynamic version
- ✅ **Build output** - Compiled version reflects package.json
- ✅ **Documentation** - References stay current

## 🚀 Version Management Commands

### Quick Commands

```bash
# Show current version
npm run version:show

# Update to specific version
npm run version:set 0.2.2

# Semantic versioning
npm run version:patch    # 0.2.1 → 0.2.2
npm run version:minor    # 0.2.1 → 0.3.0  
npm run version:major    # 0.2.1 → 1.0.0
```

### Manual Update

```bash
# Update package.json directly
npm version 0.2.2 --no-git-tag-version

# Or edit package.json manually
# Then run build to update all references
npm run build
```

## 📋 What Gets Updated Automatically

When you update the version in `package.json`, the following are automatically updated on the next build:

### ✅ Automatic Updates
- **`VERSION.number`** - Always matches package.json
- **`VERSION.date`** - Current date when built
- **`NEOZIPKIT_INFO.version`** - Used throughout the codebase
- **Example files** - All version references
- **Compiled output** - All built files

### ✅ No Manual Updates Needed
- ❌ ~~`src/shared/version.ts`~~ - Now reads from package.json
- ❌ ~~`examples/unzip-token.ts`~~ - Now imports dynamic version
- ❌ ~~`src/blockchain/core/ZipkitOTS.ts`~~ - Now shows "Auto-generated"
- ❌ ~~Any other version references~~ - All are now dynamic

## 🔧 Development Workflow

### 1. Update Version
```bash
# Choose your method:
npm run version:patch    # For bug fixes
npm run version:minor    # For new features  
npm run version:major    # For breaking changes
npm run version:set 1.0.0  # For specific version
```

### 2. Build Package
```bash
npm run build
```

### 3. Verify Version
```bash
npm run version:show
# Or check the built output
node -e "const { VERSION } = require('./dist/shared/version.js'); console.log(VERSION);"
```

### 4. Test & Commit
```bash
# Test your changes
npm test

# Commit with version tag
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
```

## 🎉 Benefits

### ✅ **Single Source of Truth**
- Only `package.json` needs to be updated
- No more version synchronization issues
- Impossible to have mismatched versions

### ✅ **Automatic Updates**
- All version references update automatically
- No manual editing of multiple files
- Build process handles everything

### ✅ **Developer Friendly**
- Simple npm scripts for common operations
- Clear error messages and usage instructions
- Semantic versioning support

### ✅ **Build Safety**
- Version is read at build time
- No runtime version mismatches
- Consistent across all environments

## 🚨 Important Notes

### Always Build After Version Changes
```bash
# After updating package.json version
npm run build  # ← This updates all version references
```

### Version Format
- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Examples: `1.0.0`, `0.2.1`, `2.1.3`
- Avoid: `1.0`, `v1.0.0`, `1.0.0-beta`

### Git Integration
The version script uses `--no-git-tag-version` by default to avoid automatic git commits. You can manually commit and tag:

```bash
npm run version:minor
npm run build
git add .
git commit -m "Release v0.3.0"
git tag v0.3.0
```

## 📚 Examples

### Patch Release (Bug Fix)
```bash
npm run version:patch  # 0.2.1 → 0.2.2
npm run build
git add . && git commit -m "Fix: Bug fixes in v0.2.2"
git tag v0.2.2
```

### Minor Release (New Features)
```bash
npm run version:minor  # 0.2.1 → 0.3.0
npm run build
git add . && git commit -m "Feat: New features in v0.3.0"
git tag v0.3.0
```

### Major Release (Breaking Changes)
```bash
npm run version:major  # 0.2.1 → 1.0.0
npm run build
git add . && git commit -m "BREAKING: Major changes in v1.0.0"
git tag v1.0.0
```

---

**🎯 Remember: Only update `package.json` version - everything else is automatic!**
