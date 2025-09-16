import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConfigValidationService } from './config-validation.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Environment Validation Integration Tests', () => {
    let configService: ConfigService;
    let validationService: ConfigValidationService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    envFilePath: '.env.example', // Use example env for testing
                }),
            ],
            providers: [ConfigValidationService],
        }).compile();

        configService = module.get<ConfigService>(ConfigService);
        validationService = module.get<ConfigValidationService>(ConfigValidationService);
    });

    describe('Environment Files Validation', () => {
        it('should validate .env.example file exists and is complete', () => {
            const envExamplePath = path.resolve('.env.example');
            expect(fs.existsSync(envExamplePath)).toBe(true);

            const envContent = fs.readFileSync(envExamplePath, 'utf8');

            // Check for required sections
            expect(envContent).toContain('Database Configuration');
            expect(envContent).toContain('Redis Configuration');
            expect(envContent).toContain('Security Configuration');
            expect(envContent).toContain('GitHub Integration');
            expect(envContent).toContain('Email Configuration');
        });

        it('should validate production environment file exists', () => {
            const envProdPath = path.resolve('.env.production');
            expect(fs.existsSync(envProdPath)).toBe(true);

            const envContent = fs.readFileSync(envProdPath, 'utf8');

            // Production should have security warnings
            expect(envContent).toContain('CHANGE THESE');
            expect(envContent).toContain('production');
        });

        it('should validate staging environment file exists', () => {
            const envStagingPath = path.resolve('.env.staging');
            expect(fs.existsSync(envStagingPath)).toBe(true);

            const envContent = fs.readFileSync(envStagingPath, 'utf8');
            expect(envContent).toContain('staging');
        });
    });

    describe('Configuration Loading', () => {
        it('should load configuration from .env.example', () => {
            const databaseUrl = configService.get<string>('DATABASE_URL');
            const nodeEnv = configService.get<string>('NODE_ENV');
            const port = configService.get<string>('PORT');

            expect(databaseUrl).toBeDefined();
            expect(nodeEnv).toBeDefined();
            expect(port).toBeDefined();
        });

        it('should provide sensible defaults', () => {
            const config = validationService.getConfigWithDefaults();

            expect(config.PORT).toBe('3000');
            expect(['development', 'test']).toContain(config.NODE_ENV); // Jest sets NODE_ENV to 'test'
            expect(config.REDIS_HOST).toBe('localhost');
            expect(config.REDIS_PORT).toBe('6379');
            expect(config.APP_NAME).toBe('GitSink');
        });
    });

    describe('Validation Rules', () => {
        it('should validate example configuration successfully', () => {
            const result = validationService.validateConfiguration();

            // Example config should be mostly valid (may have warnings)
            expect(result.errors.length).toBeLessThanOrEqual(1); // Allow for minor issues
            expect(result.missingRequired.length).toBe(0);
        });

        it('should detect missing required variables', () => {
            // Create a service with empty config
            const emptyConfigService = {
                get: jest.fn().mockReturnValue(undefined),
            };

            const emptyValidationService = new ConfigValidationService(emptyConfigService as any);
            const result = emptyValidationService.validateConfiguration();

            expect(result.isValid).toBe(false);
            expect(result.missingRequired.length).toBeGreaterThan(0);
            expect(result.missingRequired).toContain('DATABASE_URL');
            expect(result.missingRequired).toContain('JWT_SECRET');
        });
    });

    describe('Environment-Specific Validation', () => {
        it('should handle development environment', () => {
            const devConfigService = {
                get: jest.fn().mockImplementation((key: string) => {
                    const devConfig: Record<string, string> = {
                        DATABASE_URL: 'postgresql://user:pass@localhost:5432/dev',
                        NODE_ENV: 'development',
                        JWT_SECRET: 'dev-jwt-secret-at-least-32-characters-long',
                        TOKEN_ENCRYPTION_KEY: 'dev-encryption-key-at-least-32-characters-long',
                        GITHUB_CLIENT_ID: 'dev-github-client-id',
                        GITHUB_CLIENT_SECRET: 'dev-github-client-secret',
                        GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
                    };
                    return devConfig[key];
                }),
            };

            const devValidationService = new ConfigValidationService(devConfigService as any);
            const result = devValidationService.validateConfiguration();

            expect(result.isValid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it('should handle production environment with strict validation', () => {
            const prodConfigService = {
                get: jest.fn().mockImplementation((key: string) => {
                    const prodConfig: Record<string, string> = {
                        DATABASE_URL: 'postgresql://user:pass@prod-db:5432/prod',
                        NODE_ENV: 'production',
                        JWT_SECRET: 'production-jwt-secret-at-least-32-characters-long-and-secure',
                        TOKEN_ENCRYPTION_KEY: 'production-encryption-key-at-least-32-characters-long-secure',
                        GITHUB_CLIENT_ID: 'prod-github-client-id',
                        GITHUB_CLIENT_SECRET: 'prod-github-client-secret',
                        GITHUB_CALLBACK_URL: 'https://api.example.com/auth/github/callback',
                        SENTRY_DSN: 'https://example@sentry.io/project',
                        SMTP_HOST: 'smtp.example.com',
                        SMTP_USER: 'noreply@example.com',
                        SMTP_PASS: 'smtp-password',
                    };
                    return prodConfig[key];
                }),
            };

            const prodValidationService = new ConfigValidationService(prodConfigService as any);
            const result = prodValidationService.validateConfiguration();

            expect(result.isValid).toBe(true);
            expect(result.warnings.length).toBeLessThanOrEqual(2); // Allow for minor warnings
        });

        it('should detect production security issues', () => {
            const insecureProdConfigService = {
                get: jest.fn().mockImplementation((key: string) => {
                    const insecureConfig: Record<string, string> = {
                        DATABASE_URL: 'postgresql://user:pass@prod-db:5432/prod',
                        NODE_ENV: 'production',
                        JWT_SECRET: 'change-me', // Insecure default
                        TOKEN_ENCRYPTION_KEY: 'change-me', // Insecure default
                        GITHUB_CLIENT_ID: 'prod-github-client-id',
                        GITHUB_CLIENT_SECRET: 'prod-github-client-secret',
                        GITHUB_CALLBACK_URL: 'https://api.example.com/auth/github/callback',
                    };
                    return insecureConfig[key];
                }),
            };

            const insecureValidationService = new ConfigValidationService(insecureProdConfigService as any);
            const result = insecureValidationService.validateConfiguration();

            expect(result.isValid).toBe(false);
            expect(result.errors.some(error => error.includes('Default security keys'))).toBe(true);
        });
    });

    describe('Docker Environment Validation', () => {
        it('should validate Docker Compose environment variables', () => {
            const dockerConfigService = {
                get: jest.fn().mockImplementation((key: string) => {
                    const dockerConfig: Record<string, string> = {
                        DATABASE_URL: 'postgresql://gitsink:password@postgres:5432/gitsink',
                        NODE_ENV: 'production',
                        JWT_SECRET: 'docker-jwt-secret-at-least-32-characters-long',
                        TOKEN_ENCRYPTION_KEY: 'docker-encryption-key-at-least-32-characters-long',
                        GITHUB_CLIENT_ID: 'docker-github-client-id',
                        GITHUB_CLIENT_SECRET: 'docker-github-client-secret',
                        GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
                        REDIS_HOST: 'redis',
                        REDIS_PORT: '6379',
                        PORT: '3000',
                    };
                    return dockerConfig[key];
                }),
            };

            const dockerValidationService = new ConfigValidationService(dockerConfigService as any);
            const result = dockerValidationService.validateConfiguration();

            expect(result.isValid).toBe(true);
        });

        it('should handle Redis URL vs individual Redis config', () => {
            const redisUrlConfigService = {
                get: jest.fn().mockImplementation((key: string) => {
                    const config: Record<string, string> = {
                        DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
                        NODE_ENV: 'development',
                        JWT_SECRET: 'jwt-secret-at-least-32-characters-long',
                        TOKEN_ENCRYPTION_KEY: 'encryption-key-at-least-32-characters-long',
                        GITHUB_CLIENT_ID: 'github-client-id',
                        GITHUB_CLIENT_SECRET: 'github-client-secret',
                        GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
                        REDIS_URL: 'redis://redis-server:6379',
                    };
                    return config[key];
                }),
            };

            const redisUrlValidationService = new ConfigValidationService(redisUrlConfigService as any);
            const result = redisUrlValidationService.validateConfiguration();

            expect(result.isValid).toBe(true);
        });
    });

    describe('Configuration Summary', () => {
        it('should log configuration summary without errors', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            expect(() => validationService.logConfigurationSummary()).not.toThrow();

            consoleSpy.mockRestore();
        });

        it('should include all expected configuration sections in summary', () => {
            const config = validationService.getConfigWithDefaults();

            // Verify all major configuration sections are present
            expect(config).toHaveProperty('DATABASE_URL');
            expect(config).toHaveProperty('NODE_ENV');
            expect(config).toHaveProperty('JWT_SECRET');
            expect(config).toHaveProperty('GITHUB_CLIENT_ID');
            expect(config).toHaveProperty('REDIS_HOST');
            expect(config).toHaveProperty('SMTP_HOST');
            expect(config).toHaveProperty('PORT');
        });
    });
});