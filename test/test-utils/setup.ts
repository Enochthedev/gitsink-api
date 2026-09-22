/**
 * Global test setup configuration
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;

beforeAll(() => {
  global.console = {
    ...originalConsole,
    // Keep error and warn for debugging
    error: originalConsole.error,
    warn: originalConsole.warn,
    // Mock info, log, debug to reduce noise
    info: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

// Global test utilities
global.testUtils = {
  // Helper to wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create mock dates
  createMockDate: (dateString: string) => new Date(dateString),

  // Helper to generate random test data
  generateRandomString: (length: number = 10) => {
    return Math.random()
      .toString(36)
      .substring(2, length + 2);
  },

  generateRandomEmail: () => {
    const username = Math.random().toString(36).substring(2, 10);
    const domain = Math.random().toString(36).substring(2, 8);
    return `${username}@${domain}.com`;
  },
};

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-32-characters';
process.env.GITHUB_CLIENT_ID = 'test-github-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Extend Jest matchers
expect.extend({
  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },

  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = typeof received === 'string' && emailRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  },

  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
});

// Declare global types for TypeScript
/* eslint-disable @typescript-eslint/no-namespace, no-var -- jest matcher/global augmentation requires this form */
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDate(): R;
      toBeValidEmail(): R;
      toBeValidUUID(): R;
    }
  }

  var testUtils: {
    waitFor: (ms: number) => Promise<void>;
    createMockDate: (dateString: string) => Date;
    generateRandomString: (length?: number) => string;
    generateRandomEmail: () => string;
  };
}

// Export to make this a module
export {};
