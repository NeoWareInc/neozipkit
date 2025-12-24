module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  // Increase timeout for tests that may take longer (like crypto operations)
  testTimeout: 30000,
  // Ignore node_modules except for ESM modules that need transformation
  transformIgnorePatterns: [
    'node_modules/(?!(@oneidentity/zstd-js)/)'
  ]
};

