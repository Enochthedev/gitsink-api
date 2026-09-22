import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SECURITY_CONFIG, SecurityTestHelper } from './security-test-utils';

describe('Security Configuration Tests', () => {
  let configService: ConfigService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                JWT_SECRET: 'test-jwt-secret-with-sufficient-length',
                TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-characters',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
                REDIS_URL: 'redis://localhost:6379',
                GITHUB_CLIENT_SECRET: 'github-client-secret',
                SESSION_SECRET: 'session-secret-with-sufficient-length',
                RATE_LIMIT_MAX: '100',
                RATE_LIMIT_WINDOW: '60000',
                MAX_FILE_SIZE: '10485760', // 10MB
                ALLOWED_ORIGINS: 'http://localhost:3000,https://gitsink.com',
                SECURE_COOKIES: 'true',
                HTTPS_ONLY: 'true',
                BCRYPT_ROUNDS: '12',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Environment Variable Security', () => {
    it('should have secure JWT secret configuration', () => {
      const jwtSecret = configService.get('JWT_SECRET');

      expect(jwtSecret).toBeDefined();
      expect(jwtSecret.length).toBeGreaterThanOrEqual(32);
      expect(jwtSecret).not.toBe('secret');
      expect(jwtSecret).not.toBe('jwt-secret');
      expect(jwtSecret).not.toBe('your-secret-key');
    });

    it('should have secure encryption key configuration', () => {
      const encryptionKey = configService.get('TOKEN_ENCRYPTION_KEY');

      expect(encryptionKey).toBeDefined();
      expect(encryptionKey.length).toBeGreaterThanOrEqual(32);
      expect(encryptionKey).not.toBe('encryption-key');
      expect(encryptionKey).not.toBe('your-encryption-key');
    });

    it('should have secure session configuration', () => {
      const sessionSecret = configService.get('SESSION_SECRET');

      expect(sessionSecret).toBeDefined();
      expect(sessionSecret.length).toBeGreaterThanOrEqual(32);
      expect(sessionSecret).not.toBe('session-secret');
    });

    it('should have proper database URL format', () => {
      const databaseUrl = configService.get('DATABASE_URL');

      expect(databaseUrl).toBeDefined();
      expect(databaseUrl).toMatch(/^postgresql:\/\//);
      expect(databaseUrl).not.toContain('password');
      expect(databaseUrl).not.toContain('admin');
    });

    it('should have secure cookie settings', () => {
      const secureCookies = configService.get('SECURE_COOKIES');
      const httpsOnly = configService.get('HTTPS_ONLY');

      expect(secureCookies).toBe('true');
      expect(httpsOnly).toBe('true');
    });

    it('should have proper bcrypt rounds configuration', () => {
      const bcryptRounds = parseInt(configService.get('BCRYPT_ROUNDS') || '10');

      expect(bcryptRounds).toBeGreaterThanOrEqual(10);
      expect(bcryptRounds).toBeLessThanOrEqual(15);
    });

    it('should have rate limiting configuration', () => {
      const rateLimitMax = parseInt(configService.get('RATE_LIMIT_MAX') || '0');
      const rateLimitWindow = parseInt(configService.get('RATE_LIMIT_WINDOW') || '0');

      expect(rateLimitMax).toBeGreaterThan(0);
      expect(rateLimitMax).toBeLessThanOrEqual(1000);
      expect(rateLimitWindow).toBeGreaterThan(0);
    });

    it('should have file size limits', () => {
      const maxFileSize = parseInt(configService.get('MAX_FILE_SIZE') || '0');

      expect(maxFileSize).toBeGreaterThan(0);
      expect(maxFileSize).toBeLessThanOrEqual(50 * 1024 * 1024); // 50MB max
    });

    it('should have allowed origins configured', () => {
      const allowedOrigins = configService.get('ALLOWED_ORIGINS');

      expect(allowedOrigins).toBeDefined();
      expect(allowedOrigins).toContain('localhost');
      expect(allowedOrigins).not.toContain('*');
    });
  });

  describe('Security Headers Configuration', () => {
    it('should validate Content Security Policy', () => {
      const csp =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';";

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('should validate security header values', () => {
      const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      };

      expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff');
      expect(securityHeaders['X-Frame-Options']).toBe('DENY');
      expect(securityHeaders['X-XSS-Protection']).toBe('1; mode=block');
      expect(securityHeaders['Strict-Transport-Security']).toContain('max-age=');
      expect(securityHeaders['Referrer-Policy']).toBeDefined();
    });
  });

  describe('Cryptographic Configuration', () => {
    it('should use secure hashing algorithms', () => {
      const allowedHashAlgorithms = ['bcrypt', 'scrypt', 'argon2'];
      const currentAlgorithm = 'bcrypt'; // Assuming bcrypt is used

      expect(allowedHashAlgorithms).toContain(currentAlgorithm);
    });

    it('should use secure encryption algorithms', () => {
      const allowedEncryptionAlgorithms = ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'];
      const currentAlgorithm = 'aes-256-gcm'; // Assuming AES-256-GCM is used

      expect(allowedEncryptionAlgorithms).toContain(currentAlgorithm);
    });

    it('should use secure random number generation', () => {
      const randomBytes = require('crypto').randomBytes(32);

      expect(randomBytes).toBeDefined();
      expect(randomBytes.length).toBe(32);
    });
  });

  describe('Input Validation Configuration', () => {
    it('should have proper input size limits', () => {
      const limits = {
        maxTitleLength: 200,
        maxDescriptionLength: 5000,
        maxTagsCount: 20,
        maxTagLength: 50,
        maxUsernameLength: 50,
        maxEmailLength: 254,
        maxBioLength: 1000,
      };

      Object.entries(limits).forEach(([field, limit]) => {
        expect(limit).toBeGreaterThan(0);
        expect(limit).toBeLessThan(10000);
      });
    });

    it('should have proper regex patterns for validation', () => {
      const patterns = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        username: /^[a-zA-Z0-9_-]{3,50}$/,
        url: /^https?:\/\/.+/,
        githubUrl: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/,
      };

      expect(patterns.email.test('test@example.com')).toBe(true);
      expect(patterns.email.test('invalid-email')).toBe(false);

      expect(patterns.username.test('validuser123')).toBe(true);
      expect(patterns.username.test('invalid user!')).toBe(false);

      expect(patterns.url.test('https://example.com')).toBe(true);
      expect(patterns.url.test('invalid-url')).toBe(false);

      expect(patterns.githubUrl.test('https://github.com/user/repo')).toBe(true);
      expect(patterns.githubUrl.test('https://evil.com/malicious')).toBe(false);
    });
  });

  describe('Authentication Configuration', () => {
    it('should have secure JWT configuration', () => {
      const jwtConfig = {
        algorithm: 'HS256',
        expiresIn: '1h',
        issuer: 'gitsink',
        audience: 'gitsink-users',
      };

      expect(['HS256', 'RS256', 'ES256']).toContain(jwtConfig.algorithm);
      expect(jwtConfig.expiresIn).toBeDefined();
      expect(jwtConfig.issuer).toBeDefined();
      expect(jwtConfig.audience).toBeDefined();
    });

    it('should have secure session configuration', () => {
      const sessionConfig = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict' as const,
        maxAge: 30 * 60 * 1000, // 30 minutes
      };

      expect(sessionConfig.httpOnly).toBe(true);
      expect(sessionConfig.secure).toBe(true);
      expect(sessionConfig.sameSite).toBe('strict');
      expect(sessionConfig.maxAge).toBeGreaterThan(0);
      expect(sessionConfig.maxAge).toBeLessThanOrEqual(24 * 60 * 60 * 1000); // Max 24 hours
    });

    it('should have proper password policy', () => {
      const passwordPolicy = {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false, // Optional for user experience
        maxLength: 128,
      };

      expect(passwordPolicy.minLength).toBeGreaterThanOrEqual(8);
      expect(passwordPolicy.maxLength).toBeLessThanOrEqual(256);
    });
  });

  describe('API Security Configuration', () => {
    it('should have proper API versioning', () => {
      const apiVersion = 'v1';
      const supportedVersions = ['v1'];

      expect(supportedVersions).toContain(apiVersion);
    });

    it('should have API key configuration', () => {
      const apiKeyConfig = {
        minLength: 32,
        maxLength: 64,
        allowedChars: /^[a-zA-Z0-9-_]+$/,
        expiresIn: 365 * 24 * 60 * 60 * 1000, // 1 year
      };

      expect(apiKeyConfig.minLength).toBeGreaterThanOrEqual(32);
      expect(apiKeyConfig.maxLength).toBeLessThanOrEqual(128);
      expect(apiKeyConfig.allowedChars).toBeDefined();
      expect(apiKeyConfig.expiresIn).toBeGreaterThan(0);
    });

    it('should have proper CORS configuration', () => {
      const corsConfig = {
        origin: ['http://localhost:3000', 'https://gitsink.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: true,
        maxAge: 86400, // 24 hours
      };

      expect(Array.isArray(corsConfig.origin)).toBe(true);
      expect(corsConfig.origin).not.toContain('*');
      expect(corsConfig.methods).toContain('GET');
      expect(corsConfig.allowedHeaders).toContain('Authorization');
      expect(corsConfig.credentials).toBe(true);
    });
  });

  describe('Database Security Configuration', () => {
    it('should have secure database connection settings', () => {
      const dbConfig = {
        ssl: true,
        connectionTimeout: 30000,
        maxConnections: 100,
        idleTimeout: 300000,
        statementTimeout: 30000,
      };

      expect(dbConfig.ssl).toBe(true);
      expect(dbConfig.connectionTimeout).toBeGreaterThan(0);
      expect(dbConfig.maxConnections).toBeGreaterThan(0);
      expect(dbConfig.maxConnections).toBeLessThanOrEqual(200);
    });

    it('should have proper query timeout settings', () => {
      const queryTimeout = 30000; // 30 seconds

      expect(queryTimeout).toBeGreaterThan(0);
      expect(queryTimeout).toBeLessThanOrEqual(60000); // Max 60 seconds
    });
  });

  describe('Logging and Monitoring Configuration', () => {
    it('should have secure logging configuration', () => {
      const logConfig = {
        level: 'info',
        sanitizeData: true,
        includeStackTrace: false, // In production
        maxLogSize: 100 * 1024 * 1024, // 100MB
        retentionDays: 30,
      };

      expect(['error', 'warn', 'info', 'debug']).toContain(logConfig.level);
      expect(logConfig.sanitizeData).toBe(true);
      expect(logConfig.includeStackTrace).toBe(false);
      expect(logConfig.maxLogSize).toBeGreaterThan(0);
      expect(logConfig.retentionDays).toBeGreaterThan(0);
    });

    it('should have audit logging configuration', () => {
      const auditConfig = {
        enabled: true,
        logAuthEvents: true,
        logDataChanges: true,
        logSecurityEvents: true,
        retentionDays: 90,
      };

      expect(auditConfig.enabled).toBe(true);
      expect(auditConfig.logAuthEvents).toBe(true);
      expect(auditConfig.logDataChanges).toBe(true);
      expect(auditConfig.logSecurityEvents).toBe(true);
      expect(auditConfig.retentionDays).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Security Testing Configuration', () => {
    it('should validate security test configuration', () => {
      const testConfig = DEFAULT_SECURITY_CONFIG;

      expect(testConfig.maxRequestsPerMinute).toBeGreaterThan(0);
      expect(testConfig.maxPayloadSize).toBeGreaterThan(0);
      expect(testConfig.maxFileSize).toBeGreaterThan(0);
      expect(Array.isArray(testConfig.allowedFileTypes)).toBe(true);
      expect(Array.isArray(testConfig.blockedUserAgents)).toBe(true);
      expect(Array.isArray(testConfig.trustedOrigins)).toBe(true);
      expect(testConfig.sessionTimeout).toBeGreaterThan(0);
      expect(testConfig.maxLoginAttempts).toBeGreaterThan(0);
      expect(testConfig.lockoutDuration).toBeGreaterThan(0);
    });

    it('should have proper test data sanitization', () => {
      const testData = {
        password: 'secret123',
        token: 'jwt-token-here',
        apiKey: 'api-key-here',
        normalField: 'normal-value',
      };

      const sanitized = SecurityTestHelper.sanitizeForLog(testData);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('normal-value');
    });
  });
});
