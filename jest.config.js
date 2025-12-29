module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  testTimeout: 30000,
  // Global teardown to ensure cleanup
  globalTeardown: '<rootDir>/tests/teardown.ts',
  // Force Jest to exit after tests complete, even if there are open handles
  // This prevents warnings about worker processes not exiting gracefully
  // which can occur with file handles, streams, or WASM modules (like ZSTD)
  forceExit: true
};

