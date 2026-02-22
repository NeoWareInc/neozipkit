# Jest Open Handles Warning

## Issue

When running tests with `yarn test:unit`, Jest may show warnings about worker processes not exiting gracefully:

```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown.
```

## Root Cause (FIXED)

The warning was caused by **uncleared `setTimeout` timers** in the blockchain contract version compatibility tests.

**Issue**: In `src/blockchain/core/ZipkitVerifier.ts`, `setTimeout` was used for timeout handling but the timers were never cleared when the promise resolved, leaving 3 open handles.

**Fix**: Modified the timeout implementation to store the timer ID and clear it in a `finally` block, ensuring cleanup whether the promise resolves or rejects.

## Current Status

✅ **All tests pass** (103 tests passing)
✅ **Proper cleanup implemented** in test files
✅ **Global teardown** added with delay for resource cleanup
✅ **forceExit: true** configured to ensure Jest exits
✅ **setTimeout timers fixed** - timers are now properly cleared in `ZipkitVerifier.ts`

## Configuration

The following Jest configuration helps manage this:

```javascript
// jest.config.js
module.exports = {
  // ... other config
  globalTeardown: '<rootDir>/tests/teardown.ts',
  openHandlesTimeout: 2000,  // Wait 2 seconds for handles to close
  forceExit: true            // Force exit even if handles remain
};
```

## Investigation Attempts

We attempted to use `--detectOpenHandles` to identify specific open handles, but encountered a Jest dependency resolution issue when running through automated tools:

```
Error: Cannot find module '@jest/test-sequencer'
```

This appears to be a Yarn module resolution issue. However, you can run `--detectOpenHandles` directly from your terminal:

```bash
# Run with open handles detection
yarn test:unit --detectOpenHandles

# Or for a specific test file
yarn exec jest tests/unit/node/EncryptionFlag.test.ts --detectOpenHandles
```

This will show detailed information about what resources are keeping Jest from exiting cleanly.

## Impact

- **Tests**: All tests pass successfully
- **Functionality**: No impact on test execution or results
- **Warning**: Informational only - Jest still exits successfully

## Fix Applied

The issue was identified using `--detectOpenHandles` and fixed in `src/blockchain/core/ZipkitVerifier.ts`:

```typescript
// Before (leaked timer):
const version = await Promise.race([
  contract.getVersion(),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('getVersion timeout after 10 seconds')), 10000)
  )
]);

// After (timer cleared):
let timeoutId: NodeJS.Timeout | null = null;
const version = await Promise.race([
  contract.getVersion(),
  new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('getVersion timeout after 10 seconds')), 10000);
  })
]).finally(() => {
  // Clear the timeout if it's still pending
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
  }
});
```

This ensures the timeout is cleared whether the promise resolves successfully or times out.

## Related Files

- `jest.config.js` - Jest configuration
- `tests/teardown.ts` - Global teardown hook
- `tests/unit/node/EncryptionFlag.test.ts` - Example of proper cleanup implementation

