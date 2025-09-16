/**
 * Comprehensive Test Configuration
 * Centralized configuration for all test types and environments
 */

const path = require('path');

// Base configuration
const baseConfig = {
    // Test directories
    testDir: path.join(__dirname, 'src'),
    testResultsDir: path.join(__dirname, 'test-results'),
    coverageDir: path.join(__dirname, 'coverage'),

    // Timeout settings
    timeouts: {
        unit: 10000,        // 10 seconds
        integration: 30000, // 30 seconds
        e2e: 60000,        // 60 seconds
        performance: 120000 // 2 minutes
    },

    // Coverage thresholds
    coverage: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        critical: {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90
        }
    },

    // Database configurations
    databases: {
        test: {
            url: 'postgresql://test_user:test_password@localhost:5433/gitsink_test',
            port: 5433
        },
        e2e: {
            url: 'postgresql://e2e_user:e2e_password@localhost:5434/gitsink_e2e',
            port: 5434
        },
        performance: {
            url: 'postgresql://perf_user:perf_password@localhost:5435/gitsink_perf',
            port: 5435
        }
    },

    // Redis configurations
    redis: {
        test: {
            url: 'redis://localhost:6380',
            port: 6380
        },
        e2e: {
            url: 'redis://localhost:6381',
            port: 6381
        },
        performance: {
            url: 'redis://localhost:6382',
            port: 6382
        }
    }
};

// Jest configuration for unit tests
const jestUnitConfig = {
    ...require('./jest.config.js'),
    displayName: 'Unit Tests',
    testMatch: [
        '<rootDir>/src/**/*.spec.ts',
        '!<rootDir>/src/**/*.integration.spec.ts',
        '!<rootDir>/src/**/*.e2e.spec.ts',
        '!<rootDir>/src/**/*.security.spec.ts'
    ],
    testTimeout: baseConfig.timeouts.unit,
    coverageThreshold: {
        global: baseConfig.coverage.global,
        // Critical modules require higher coverage
        './src/auth/': baseConfig.coverage.critical,
        './src/projects/': baseConfig.coverage.critical,
        './src/utils/': baseConfig.coverage.critical
    },
    setupFilesAfterEnv: ['<rootDir>/test/test-utils/setup.ts'],
    testEnvironment: 'node'
};

// Jest configuration for integration tests
const jestIntegrationConfig = {
    ...require('./jest.config.js'),
    displayName: 'Integration Tests',
    testMatch: [
        '<rootDir>/src/**/*.integration.spec.ts',
        '<rootDir>/test/**/*.integration.spec.ts'
    ],
    testTimeout: baseConfig.timeouts.integration,
    setupFilesAfterEnv: [
        '<rootDir>/test/test-utils/setup.ts',
        '<rootDir>/test/test-utils/integration-helpers.ts'
    ],
    globalSetup: '<rootDir>/test/global-setup.js',
    globalTeardown: '<rootDir>/test/global-teardown.js',
    testEnvironment: 'node'
};

// Jest configuration for E2E tests
const jestE2EConfig = {
    ...require('./test/jest-e2e.json'),
    displayName: 'E2E Tests',
    testTimeout: baseConfig.timeouts.e2e,
    setupFilesAfterEnv: ['<rootDir>/test/e2e-setup.ts'],
    globalSetup: '<rootDir>/test/e2e-global-setup.js',
    globalTeardown: '<rootDir>/test/e2e-global-teardown.js'
};

// Security test configuration
const jestSecurityConfig = {
    ...require('./jest.config.js'),
    displayName: 'Security Tests',
    testMatch: [
        '<rootDir>/src/**/*.security.spec.ts',
        '<rootDir>/src/security/**/*.spec.ts'
    ],
    testTimeout: baseConfig.timeouts.integration,
    setupFilesAfterEnv: ['<rootDir>/test/test-utils/setup.ts']
};

// Performance test configuration
const performanceConfig = {
    k6: {
        scenarios: {
            baseline: {
                executor: 'constant-vus',
                vus: 10,
                duration: '30s'
            },
            load: {
                executor: 'ramping-vus',
                startVUs: 0,
                stages: [
                    { duration: '2m', target: 100 },
                    { duration: '5m', target: 100 },
                    { duration: '2m', target: 200 },
                    { duration: '5m', target: 200 },
                    { duration: '2m', target: 0 }
                ]
            },
            stress: {
                executor: 'ramping-vus',
                startVUs: 0,
                stages: [
                    { duration: '2m', target: 100 },
                    { duration: '5m', target: 100 },
                    { duration: '2m', target: 200 },
                    { duration: '5m', target: 200 },
                    { duration: '2m', target: 300 },
                    { duration: '5m', target: 300 },
                    { duration: '2m', target: 400 },
                    { duration: '5m', target: 400 },
                    { duration: '10m', target: 0 }
                ]
            },
            spike: {
                executor: 'ramping-vus',
                startVUs: 0,
                stages: [
                    { duration: '10s', target: 100 },
                    { duration: '1m', target: 100 },
                    { duration: '10s', target: 1400 },
                    { duration: '3m', target: 1400 },
                    { duration: '10s', target: 100 },
                    { duration: '3m', target: 100 },
                    { duration: '10s', target: 0 }
                ]
            }
        },
        thresholds: {
            http_req_duration: ['p(95)<200'],
            http_req_failed: ['rate<0.01'],
            http_reqs: ['rate>100']
        }
    }
};

// CI/CD pipeline configuration
const ciConfig = {
    parallel: {
        unit: true,
        integration: true,
        e2e: false, // E2E tests run sequentially
        security: true,
        performance: false // Performance tests run on specific triggers
    },

    retries: {
        unit: 2,
        integration: 3,
        e2e: 2,
        security: 1,
        performance: 1
    },

    artifacts: {
        retention: {
            coverage: 7,      // days
            reports: 30,      // days
            performance: 90,  // days
            security: 180     // days
        }
    },

    notifications: {
        slack: {
            webhook: process.env.SLACK_WEBHOOK_URL,
            channels: {
                success: '#ci-success',
                failure: '#ci-failures',
                performance: '#performance-alerts'
            }
        },
        email: {
            recipients: process.env.CI_EMAIL_RECIPIENTS?.split(',') || [],
            onFailure: true,
            onSuccess: false
        }
    }
};

// Environment-specific configurations
const environments = {
    development: {
        database: baseConfig.databases.test,
        redis: baseConfig.redis.test,
        logging: 'debug',
        coverage: false
    },

    test: {
        database: baseConfig.databases.test,
        redis: baseConfig.redis.test,
        logging: 'error',
        coverage: true
    },

    e2e: {
        database: baseConfig.databases.e2e,
        redis: baseConfig.redis.e2e,
        logging: 'warn',
        coverage: true
    },

    performance: {
        database: baseConfig.databases.performance,
        redis: baseConfig.redis.performance,
        logging: 'error',
        coverage: false
    },

    ci: {
        database: baseConfig.databases.test,
        redis: baseConfig.redis.test,
        logging: 'error',
        coverage: true,
        parallel: true
    }
};

// Test data configuration
const testData = {
    users: {
        test: 10,
        e2e: 50,
        performance: 1000
    },

    projects: {
        test: 20,
        e2e: 100,
        performance: 5000
    },

    syncHistory: {
        test: 50,
        e2e: 200,
        performance: 10000
    }
};

// Export configuration based on environment
const getConfig = (env = process.env.NODE_ENV || 'development') => {
    return {
        base: baseConfig,
        jest: {
            unit: jestUnitConfig,
            integration: jestIntegrationConfig,
            e2e: jestE2EConfig,
            security: jestSecurityConfig
        },
        performance: performanceConfig,
        ci: ciConfig,
        environment: environments[env] || environments.development,
        testData: testData,

        // Helper methods
        getDatabaseUrl: (testType = 'test') => {
            return baseConfig.databases[testType]?.url || baseConfig.databases.test.url;
        },

        getRedisUrl: (testType = 'test') => {
            return baseConfig.redis[testType]?.url || baseConfig.redis.test.url;
        },

        getTimeout: (testType = 'unit') => {
            return baseConfig.timeouts[testType] || baseConfig.timeouts.unit;
        },

        getCoverageThreshold: (module = 'global') => {
            if (module.includes('auth') || module.includes('projects') || module.includes('utils')) {
                return baseConfig.coverage.critical;
            }
            return baseConfig.coverage.global;
        }
    };
};

module.exports = getConfig();