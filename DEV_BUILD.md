# Development Build System

This project includes a separate development build system that doesn't interfere with the main production build.

## 🎯 **Purpose**

- **Main Build (`dist/`)**: Production-ready builds tracked in git - **Recommended for main branch**
- **Dev Build (`dev-dist/`)**: Development builds NOT tracked in git - **Recommended for all branches**

## 📁 **Directory Structure**

```
neozipkit/
├── dist/           # Production builds (tracked in git)
├── dev-dist/       # Development builds (ignored by git)
├── src/            # Source code
└── tsconfig.dev.json # Dev build configuration
```

## 🚀 **Available Commands**

### Production Builds
```bash
# Clean and build production version (works on any branch)
yarn build

# Watch mode for production
yarn watch

# CI-protected build (main branch only in CI)
yarn build:ci
```

### Development Builds (recommended)
```bash
# Clean and build development version
yarn dev:build

# Watch mode for development
yarn dev:watch

# Clean dev build only
yarn dev:clean
```

### Smart Build (recommended)
```bash
# Automatically chooses appropriate build based on branch and environment
yarn build:auto
```

## ⚙️ **Configuration**

### Main Build (`tsconfig.json`)
- Output: `./dist/`
- Used for: Production releases, npm publishing
- Tracked in: Git

### Dev Build (`tsconfig.dev.json`)
- Output: `./dev-dist/`
- Used for: Development, testing, local changes
- Tracked in: Git (ignored)

## 🔧 **Key Differences**

| Feature | Production Build | Dev Build |
|---------|------------------|-----------|
| Output Directory | `dist/` | `dev-dist/` |
| Recommended For | **main branch** | **All branches** |
| Git Tracking | ✅ Tracked | ❌ Ignored |
| Source Maps | ✅ Enabled | ✅ Enabled |
| Incremental | ❌ No | ✅ Yes |
| Build Info | ❌ No | ✅ Yes |
| CI Protection | ✅ Main branch only | ✅ All branches |

## 📝 **Usage Examples**

### For Development
```bash
# Start development with watch mode
yarn dev:watch

# Your changes will be compiled to dev-dist/
# You can test against dev-dist/ without affecting dist/
```

### For Production
```bash
# Build production version
yarn build

# This creates the final dist/ for publishing
```

## 🚫 **What's Ignored**

The following are automatically ignored by git:
- `dev-dist/` - All development build artifacts
- `dev-build/` - Additional dev build outputs
- `.tsbuildinfo` - TypeScript incremental build info

## 💡 **Best Practices**

1. **Use `yarn dev:watch`** for active development
2. **Use `yarn build`** only when ready for production
3. **Never commit `dev-dist/`** - it's automatically ignored
4. **Test against `dev-dist/`** during development
5. **Test against `dist/`** before publishing

## 🔄 **Workflow**

```bash
# 1. Start development
yarn dev:watch

# 2. Make changes to src/
# 3. Changes auto-compile to dev-dist/

# 4. Test your changes
node -e "console.log(require('./dev-dist/index.js'))"

# 5. When ready, build production
yarn build

# 6. Test production build
node -e "console.log(require('./dist/index.js'))"
```

This system ensures your development work never interferes with the production build that gets published to npm!
