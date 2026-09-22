import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  invalidValues: string[];
}

export interface EnvironmentConfig {
  // Database
  DATABASE_URL: string;

  // Redis
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;
  REDIS_DB?: string;

  // Server
  PORT?: string;
  NODE_ENV: string;

  // Authentication
  JWT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;

  // GitHub
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CALLBACK_URL: string;
  GITHUB_PERSONAL_TOKEN?: string;

  // Email
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM?: string;

  // Security
  CORS_ORIGIN?: string;
  ENABLE_HELMET?: string;
  ENABLE_RATE_LIMIT?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX?: string;

  // Monitoring
  SENTRY_DSN?: string;
  PROMETHEUS_ENABLED?: string;

  // Application
  APP_NAME?: string;
  APP_VERSION?: string;
  WEBHOOK_USER_ID?: string;

  // Development
  LOCAL_API_KEY?: string;
}

@Injectable()
export class ConfigValidationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigValidationService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const result = this.validateConfiguration();

    if (!result.isValid) {
      this.logger.error('Configuration validation failed:', {
        errors: result.errors,
        missingRequired: result.missingRequired,
        invalidValues: result.invalidValues,
      });

      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Configuration validation failed: ${result.errors.join(', ')}`);
      }
    }

    if (result.warnings.length > 0) {
      this.logger.warn('Configuration warnings:', result.warnings);
    }

    this.logger.log('Configuration validation completed successfully');
  }

  validateConfiguration(): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingRequired: string[] = [];
    const invalidValues: string[] = [];

    // Required environment variables
    const requiredVars = [
      'DATABASE_URL',
      'NODE_ENV',
      'JWT_SECRET',
      'TOKEN_ENCRYPTION_KEY',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GITHUB_CALLBACK_URL',
    ];

    // Check required variables
    for (const varName of requiredVars) {
      const value = this.configService.get<string>(varName);
      if (!value || value.trim() === '') {
        missingRequired.push(varName);
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate specific configurations
    this.validateNodeEnvironment(errors, warnings, invalidValues);
    this.validateDatabaseUrl(errors, invalidValues);
    this.validateRedisConfig(errors, warnings, invalidValues);
    this.validateServerConfig(errors, warnings, invalidValues);
    this.validateAuthConfig(errors, warnings, invalidValues);
    this.validateEmailConfig(warnings);
    this.validateSecurityConfig(warnings);
    this.validateMonitoringConfig(warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingRequired,
      invalidValues,
    };
  }

  private validateNodeEnvironment(errors: string[], warnings: string[], invalidValues: string[]) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const validEnvironments = ['development', 'staging', 'production', 'test'];

    if (nodeEnv && !validEnvironments.includes(nodeEnv)) {
      invalidValues.push('NODE_ENV');
      errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be one of: ${validEnvironments.join(', ')}`);
    }

    if (nodeEnv === 'production') {
      // Production-specific validations
      const prodRequiredVars = ['SENTRY_DSN', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
      for (const varName of prodRequiredVars) {
        const value = this.configService.get<string>(varName);
        if (!value) {
          warnings.push(`Recommended for production: ${varName}`);
        }
      }

      // Check for development defaults in production
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const tokenKey = this.configService.get<string>('TOKEN_ENCRYPTION_KEY');

      if (jwtSecret === 'change-me' || tokenKey === 'change-me') {
        errors.push('Default security keys detected in production environment');
      }
    }
  }

  private validateDatabaseUrl(errors: string[], invalidValues: string[]) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');

    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
          invalidValues.push('DATABASE_URL');
          errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
        }

        if (!url.hostname || !url.pathname) {
          invalidValues.push('DATABASE_URL');
          errors.push('DATABASE_URL must include hostname and database name');
        }
      } catch (error) {
        invalidValues.push('DATABASE_URL');
        errors.push('DATABASE_URL is not a valid URL format');
      }
    }
  }

  private validateRedisConfig(errors: string[], warnings: string[], invalidValues: string[]) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisPort = this.configService.get<string>('REDIS_PORT');

    if (!redisUrl && !redisHost) {
      warnings.push('No Redis configuration found. Using default localhost:6379');
    }

    if (redisUrl) {
      try {
        const url = new URL(redisUrl);
        if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
          invalidValues.push('REDIS_URL');
          errors.push('REDIS_URL must be a valid Redis connection string');
        }
      } catch (error) {
        invalidValues.push('REDIS_URL');
        errors.push('REDIS_URL is not a valid URL format');
      }
    }

    if (redisPort) {
      const port = parseInt(redisPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        invalidValues.push('REDIS_PORT');
        errors.push('REDIS_PORT must be a valid port number (1-65535)');
      }
    }
  }

  private validateServerConfig(errors: string[], warnings: string[], invalidValues: string[]) {
    const port = this.configService.get<string>('PORT');

    if (port) {
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        invalidValues.push('PORT');
        errors.push('PORT must be a valid port number (1-65535)');
      }

      if (portNum < 1024 && process.getuid && process.getuid() !== 0) {
        warnings.push('PORT < 1024 requires root privileges');
      }
    }

    const corsOrigin = this.configService.get<string>('CORS_ORIGIN');
    if (corsOrigin === '*' && this.configService.get<string>('NODE_ENV') === 'production') {
      warnings.push('CORS_ORIGIN set to "*" in production is not recommended for security');
    }
  }

  private validateAuthConfig(errors: string[], warnings: string[], invalidValues: string[]) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const tokenKey = this.configService.get<string>('TOKEN_ENCRYPTION_KEY');

    if (jwtSecret && jwtSecret.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters for security');
    }

    if (tokenKey && tokenKey.length < 32) {
      warnings.push('TOKEN_ENCRYPTION_KEY should be at least 32 characters for security');
    }

    const githubCallbackUrl = this.configService.get<string>('GITHUB_CALLBACK_URL');
    if (githubCallbackUrl) {
      try {
        new URL(githubCallbackUrl);
      } catch (error) {
        invalidValues.push('GITHUB_CALLBACK_URL');
        errors.push('GITHUB_CALLBACK_URL must be a valid URL');
      }
    }
  }

  private validateEmailConfig(warnings: string[]) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<string>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const emailFrom = this.configService.get<string>('EMAIL_FROM');

    if (!smtpHost || !smtpUser || !smtpPass) {
      warnings.push('Email configuration incomplete. Email features may not work');
    }

    if (smtpPort) {
      const port = parseInt(smtpPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        warnings.push('SMTP_PORT should be a valid port number');
      }
    }

    if (emailFrom && !this.isValidEmail(emailFrom)) {
      warnings.push('EMAIL_FROM should be a valid email address');
    }
  }

  private validateSecurityConfig(warnings: string[]) {
    const rateLimitMax = this.configService.get<string>('RATE_LIMIT_MAX');
    const rateLimitWindow = this.configService.get<string>('RATE_LIMIT_WINDOW_MS');

    if (rateLimitMax) {
      const max = parseInt(rateLimitMax, 10);
      if (isNaN(max) || max < 1) {
        warnings.push('RATE_LIMIT_MAX should be a positive number');
      }
    }

    if (rateLimitWindow) {
      const window = parseInt(rateLimitWindow, 10);
      if (isNaN(window) || window < 1000) {
        warnings.push('RATE_LIMIT_WINDOW_MS should be at least 1000ms');
      }
    }
  }

  private validateMonitoringConfig(warnings: string[]) {
    const sentryDsn = this.configService.get<string>('SENTRY_DSN');

    if (sentryDsn) {
      try {
        new URL(sentryDsn);
      } catch (error) {
        warnings.push('SENTRY_DSN should be a valid URL');
      }
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getConfigWithDefaults(): EnvironmentConfig {
    return {
      // Database
      DATABASE_URL: this.configService.get<string>('DATABASE_URL', ''),

      // Redis
      REDIS_URL: this.configService.get<string>('REDIS_URL'),
      REDIS_HOST: this.configService.get<string>('REDIS_HOST', 'localhost'),
      REDIS_PORT: this.configService.get<string>('REDIS_PORT', '6379'),
      REDIS_PASSWORD: this.configService.get<string>('REDIS_PASSWORD'),
      REDIS_DB: this.configService.get<string>('REDIS_DB', '0'),

      // Server
      PORT: this.configService.get<string>('PORT', '3000'),
      NODE_ENV: this.configService.get<string>('NODE_ENV', 'development'),

      // Authentication
      JWT_SECRET: this.configService.get<string>('JWT_SECRET', ''),
      TOKEN_ENCRYPTION_KEY: this.configService.get<string>('TOKEN_ENCRYPTION_KEY', ''),

      // GitHub
      GITHUB_CLIENT_ID: this.configService.get<string>('GITHUB_CLIENT_ID', ''),
      GITHUB_CLIENT_SECRET: this.configService.get<string>('GITHUB_CLIENT_SECRET', ''),
      GITHUB_CALLBACK_URL: this.configService.get<string>('GITHUB_CALLBACK_URL', ''),
      GITHUB_PERSONAL_TOKEN: this.configService.get<string>('GITHUB_PERSONAL_TOKEN'),

      // Email
      SMTP_HOST: this.configService.get<string>('SMTP_HOST'),
      SMTP_PORT: this.configService.get<string>('SMTP_PORT', '587'),
      SMTP_USER: this.configService.get<string>('SMTP_USER'),
      SMTP_PASS: this.configService.get<string>('SMTP_PASS'),
      EMAIL_FROM: this.configService.get<string>('EMAIL_FROM'),

      // Security
      CORS_ORIGIN: this.configService.get<string>('CORS_ORIGIN', '*'),
      ENABLE_HELMET: this.configService.get<string>('ENABLE_HELMET', 'true'),
      ENABLE_RATE_LIMIT: this.configService.get<string>('ENABLE_RATE_LIMIT', 'true'),
      RATE_LIMIT_WINDOW_MS: this.configService.get<string>('RATE_LIMIT_WINDOW_MS', '900000'),
      RATE_LIMIT_MAX: this.configService.get<string>('RATE_LIMIT_MAX', '100'),

      // Monitoring
      SENTRY_DSN: this.configService.get<string>('SENTRY_DSN'),
      PROMETHEUS_ENABLED: this.configService.get<string>('PROMETHEUS_ENABLED', 'true'),

      // Application
      APP_NAME: this.configService.get<string>('APP_NAME', 'GitSink'),
      APP_VERSION: this.configService.get<string>('APP_VERSION', '1.0.0'),
      WEBHOOK_USER_ID: this.configService.get<string>('WEBHOOK_USER_ID'),

      // Development
      LOCAL_API_KEY: this.configService.get<string>('LOCAL_API_KEY'),
    };
  }

  logConfigurationSummary() {
    const config = this.getConfigWithDefaults();
    const nodeEnv = config.NODE_ENV;

    this.logger.log('Configuration Summary:', {
      environment: nodeEnv,
      port: config.PORT,
      database: config.DATABASE_URL ? 'configured' : 'missing',
      redis: config.REDIS_URL || config.REDIS_HOST ? 'configured' : 'default',
      email: config.SMTP_HOST ? 'configured' : 'disabled',
      monitoring: config.SENTRY_DSN ? 'enabled' : 'disabled',
      security: {
        helmet: config.ENABLE_HELMET === 'true',
        rateLimit: config.ENABLE_RATE_LIMIT === 'true',
        cors: config.CORS_ORIGIN,
      },
    });
  }
}
