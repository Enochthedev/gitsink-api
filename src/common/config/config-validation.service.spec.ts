import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigValidationService } from './config-validation.service';

describe('ConfigValidationService', () => {
  let service: ConfigValidationService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigValidationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ConfigValidationService>(ConfigValidationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConfiguration', () => {
    it('should pass validation with all required variables', () => {
      // Mock all required environment variables
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should fail validation with missing required variables', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        // Only return some required variables
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          // Missing JWT_SECRET, TOKEN_ENCRYPTION_KEY, etc.
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.missingRequired).toContain('JWT_SECRET');
      expect(result.missingRequired).toContain('TOKEN_ENCRYPTION_KEY');
    });

    it('should detect invalid NODE_ENV', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'invalid-environment',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('NODE_ENV');
      expect(result.errors.some(error => error.includes('Invalid NODE_ENV'))).toBe(true);
    });

    it('should detect invalid DATABASE_URL', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'invalid-database-url',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('DATABASE_URL');
    });

    it('should detect production security issues', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'production',
          JWT_SECRET: 'change-me', // Default value in production
          TOKEN_ENCRYPTION_KEY: 'change-me', // Default value in production
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'https://production.com/auth/github/callback',
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Default security keys'))).toBe(true);
    });

    it('should validate Redis configuration', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
          REDIS_URL: 'invalid-redis-url',
          REDIS_PORT: '99999', // Invalid port
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('REDIS_URL');
      expect(result.invalidValues).toContain('REDIS_PORT');
    });

    it('should validate server configuration', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
          PORT: '99999', // Invalid port
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('PORT');
    });

    it('should provide warnings for incomplete email configuration', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
          // Missing SMTP configuration
        };
        return mockValues[key];
      });

      const result = service.validateConfiguration();

      expect(result.isValid).toBe(true); // Should still be valid
      expect(result.warnings.some(warning => warning.includes('Email configuration'))).toBe(true);
    });
  });

  describe('getConfigWithDefaults', () => {
    it('should return configuration with proper defaults', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        // Return default value if provided, otherwise undefined
        return defaultValue;
      });

      const config = service.getConfigWithDefaults();

      expect(config.PORT).toBe('3000');
      expect(config.NODE_ENV).toBe('development');
      expect(config.REDIS_HOST).toBe('localhost');
      expect(config.REDIS_PORT).toBe('6379');
      expect(config.SMTP_PORT).toBe('587');
      expect(config.APP_NAME).toBe('GitSink');
    });

    it('should use actual values when available', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        const actualValues: Record<string, string> = {
          PORT: '8080',
          NODE_ENV: 'production',
          REDIS_HOST: 'redis.example.com',
          APP_NAME: 'CustomGitSink',
        };
        return actualValues[key] || defaultValue;
      });

      const config = service.getConfigWithDefaults();

      expect(config.PORT).toBe('8080');
      expect(config.NODE_ENV).toBe('production');
      expect(config.REDIS_HOST).toBe('redis.example.com');
      expect(config.APP_NAME).toBe('CustomGitSink');
    });
  });

  describe('onModuleInit', () => {
    it('should not throw in development with warnings', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
          NODE_ENV: 'development',
          JWT_SECRET: 'super-secret-jwt-key-at-least-32-characters-long',
          TOKEN_ENCRYPTION_KEY: 'super-secret-encryption-key-at-least-32-chars',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
        };
        return mockValues[key];
      });

      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should throw in production with validation errors', () => {
      // Mock process.env.NODE_ENV for this test
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockConfigService.get.mockImplementation((key: string) => {
        const mockValues: Record<string, string> = {
          NODE_ENV: 'production',
          // Missing required variables
        };
        return mockValues[key];
      });

      expect(() => service.onModuleInit()).toThrow();

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
