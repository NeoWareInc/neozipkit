# Development Build System

This project includes a separate development build system that doesn't interfere with the main production build.

## 🎯 **Purpose**

- **Main Build (`dist/`)**: Production-ready builds NOT tracked in git - Built during CI before publishing
- **Dev Build (`dev-dist/`)**: Development builds NOT tracked in git - **Recommended for all branches**

## 📁 **Directory Structure**

```
neozipkit/
├── dist/           # Production builds (NOT tracked in git, built during CI)
├── dev-dist/       # Development builds (ignored by git)
├── src/            # Source code
└── tsconfig.dev.json # Dev build configuration
```

## 🚀 **Available Commands**

### Production Builds
```bash
# Clean and build production version (works on any branch)
pnpm build

# Watch mode for production
pnpm watch

# CI-protected build (main branch only in CI)
pnpm build:ci
```

### Development Builds (recommended)
```bash
# Clean and build development version
pnpm dev:build

# Watch mode for development
pnpm dev:watch

# Clean dev build only
pnpm dev:clean
```

### Smart Build (recommended)
```bash
# Automatically chooses appropriate build based on branch and environment
pnpm build:auto
```

## ⚙️ **Configuration**

### Main Build (`tsconfig.json`)
- Output: `./dist/`
- Used for: Production releases, npm publishing
- Tracked in: Git (ignored - built during CI before publishing)

### Dev Build (`tsconfig.dev.json`)
- Output: `./dev-dist/`
- Used for: Development, testing, local changes
- Tracked in: Git (ignored)

## 🔧 **Key Differences**

| Feature | Production Build | Dev Build |
|---------|------------------|-----------|
| Output Directory | `dist/` | `dev-dist/` |
| Recommended For | **main branch** | **All branches** |
| Git Tracking | ❌ Ignored | ❌ Ignored |
| Source Maps | ✅ Enabled | ✅ Enabled |
| Incremental | ❌ No | ✅ Yes |
| Build Info | ❌ No | ✅ Yes |
| CI Protection | ✅ Main branch only | ✅ All branches |

## 📝 **Usage Examples**

### For Development
```bash
# Start development with watch mode
pnpm dev:watch

# Your changes will be compiled to dev-dist/
# You can test against dev-dist/ without affecting dist/
```

### For Production
```bash
# Build production version
pnpm build

# This creates the final dist/ for publishing
```

## 🚫 **What's Ignored**

The following are automatically ignored by git:
- `dist/` - Production build artifacts (built during CI before publishing)
- `dev-dist/` - All development build artifacts
- `dev-build/` - Additional dev build outputs
- `.tsbuildinfo` - TypeScript incremental build info

## 💡 **Best Practices**

1. **Use `pnpm dev:watch`** for active development
2. **Use `pnpm build`** only when ready for production
3. **Never commit `dist/` or `dev-dist/`** - they're automatically ignored
4. **Test against `dev-dist/`** during development
5. **Test against `dist/`** before publishing
6. **CI builds `dist/`** automatically before publishing to npm

## 🔄 **Workflow**

```bash
# 1. Start development
pnpm dev:watch

# 2. Make changes to src/
# 3. Changes auto-compile to dev-dist/

# 4. Test your changes
node -e "console.log(require('./dev-dist/index.js'))"

# 5. When ready, build production
pnpm build

# 6. Test production build
node -e "console.log(require('./dist/index.js'))"
```

This system ensures your development work never interferes with the production build that gets published to npm!
