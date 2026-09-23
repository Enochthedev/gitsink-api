module.exports = {
  // Use the existing Jest configuration from package.json as base
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.e2e-spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!**/*.d.ts',
    '!**/main.ts',
    '!**/test-utils/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@mail/(.*)$': '<rootDir>/mail/$1',
    '^@type/(.*)$': '<rootDir>/types/$1',
    '^@queues/(.*)$': '<rootDir>/queues/$1',
    '^@auth/(.*)$': '<rootDir>/auth/$1',
    // tsconfig maps @prisma/* to src/prisma/*; exclude client so the real
    // @prisma/client package still resolves
    '^@prisma/(?!client)(.*)$': '<rootDir>/prisma/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@waitlist/(.*)$': '<rootDir>/waitlist/$1',
    '^@interceptors/(.*)$': '<rootDir>/interceptors/$1',
    '^@metrics/(.*)$': '<rootDir>/metrics/$1',
    '^@middleware/(.*)$': '<rootDir>/common/middleware/$1',
  },

  // Enhanced coverage configuration
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Specific thresholds for critical modules
    './auth/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './projects/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './utils/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },

  // Test setup and teardown
  setupFilesAfterEnv: ['<rootDir>/../test/test-utils/setup.ts'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output for better debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Error handling
  errorOnDeprecated: true,

  // Performance
  maxWorkers: '50%',

  // Test result processor for better reporting (optional)
  // testResultsProcessor: 'jest-sonar-reporter',

  // Global test configuration
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};
