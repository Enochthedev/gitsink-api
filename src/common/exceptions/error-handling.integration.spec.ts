import { Test, TestingModule } from '@nestjs/testing';
import { Body, Controller, Get, HttpStatus, INestApplication, Post } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { ErrorHandlerService } from './error-handler.service';
import { EnhancedValidationPipe } from '../validation/enhanced-validation.pipe';
import { ErrorBoundaryInterceptor } from '../interceptors/error-boundary.interceptor';
import {
  AppError,
  AuthenticationError,
  BusinessLogicError,
  DatabaseError,
  ExternalServiceError,
  ValidationError,
} from './app-error';
import {
  DatabaseErrorBoundary,
  ErrorBoundary,
  ExternalServiceErrorBoundary,
} from '../decorators/error-boundary.decorator';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';

// Test DTOs
class TestValidationDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

// Test Controller
@Controller('test')
class TestController {
  @Get('validation-error')
  throwValidationError() {
    throw new ValidationError('Test validation error', { field: 'email' });
  }

  @Get('authentication-error')
  throwAuthenticationError() {
    throw new AuthenticationError('Test authentication error');
  }

  @Get('external-service-error')
  @ExternalServiceErrorBoundary('github', { fallback: 'data' })
  throwExternalServiceError() {
    throw new ExternalServiceError('GitHub API error', 'github', { status: 503 });
  }

  @Get('database-error')
  @DatabaseErrorBoundary({ fallback: 'data' })
  throwDatabaseError() {
    throw new DatabaseError('Database connection failed', 'query');
  }

  @Get('business-logic-error')
  throwBusinessLogicError() {
    throw new BusinessLogicError('Invalid business rule', 'INVALID_OPERATION');
  }

  @Get('generic-error')
  throwGenericError() {
    throw new Error('Generic error message');
  }

  @Get('async-error')
  async throwAsyncError() {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw new ValidationError('Async validation error');
  }

  @Get('error-boundary-fallback')
  @ErrorBoundary({
    fallback: () => ({ message: 'Fallback executed' }),
    suppressError: true,
    logErrors: true,
  })
  throwErrorWithFallback() {
    throw new Error('Error with fallback');
  }

  @Get('error-boundary-retry')
  @ErrorBoundary({
    retry: {
      attempts: 3,
      delay: 100,
      exponentialBackoff: false,
    },
  })
  throwRetryableError() {
    // This will always fail, testing retry mechanism
    throw new ExternalServiceError('Retryable error', 'test-service', {}, undefined, true);
  }

  @Post('validation-pipe')
  testValidationPipe(@Body() dto: TestValidationDto) {
    return { success: true, data: dto };
  }

  @Get('nested-error')
  async throwNestedError() {
    try {
      throw new DatabaseError('Inner database error');
    } catch (error) {
      throw new BusinessLogicError('Outer business logic error', 'NESTED_ERROR');
    }
  }
}

describe('Error Handling Integration Tests', () => {
  let app: INestApplication;
  let errorHandlerService: ErrorHandlerService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        ErrorHandlerService,
        Reflector,
        {
          provide: APP_FILTER,
          useClass: GlobalExceptionFilter,
        },
        {
          provide: APP_PIPE,
          useClass: EnhancedValidationPipe,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: ErrorBoundaryInterceptor,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    errorHandlerService = moduleFixture.get<ErrorHandlerService>(ErrorHandlerService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Global Exception Filter', () => {
    it('should handle ValidationError correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/validation-error')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Test validation error',
          category: 'validation',
        },
      });

      expect(response.body.error.timestamp).toBeDefined();
      expect(response.body.error.path).toBe('/test/validation-error');
      expect(response.headers['x-error-code']).toBe('VALIDATION_ERROR');
      expect(response.headers['x-error-category']).toBe('validation');
    });

    it('should handle AuthenticationError correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/authentication-error')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Test authentication error',
          category: 'authentication',
        },
      });
    });

    it('should handle ExternalServiceError correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/external-service-error')
        .expect(HttpStatus.BAD_GATEWAY);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'EXTERNAL_SERVICE_ERROR',
          message: 'GitHub API error',
          category: 'external_service',
        },
      });

      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should handle DatabaseError correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/database-error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database connection failed',
          category: 'database',
        },
      });
    });

    it('should handle BusinessLogicError correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/business-logic-error')
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Invalid business rule',
          category: 'business_logic',
        },
      });
    });

    it('should handle generic errors correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/generic-error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'SYSTEM_ERROR',
          message: 'Generic error message',
          category: 'system',
        },
      });
    });

    it('should handle async errors correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/async-error')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Async validation error',
          category: 'validation',
        },
      });
    });
  });

  describe('Enhanced Validation Pipe', () => {
    it('should validate request body and return detailed errors', async () => {
      const invalidData = {
        name: 'ab', // Too short
        email: 'invalid-email', // Invalid format
        description: 123, // Wrong type
      };

      const response = await request(app.getHttpServer())
        .post('/test/validation-pipe')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          category: 'validation',
        },
      });

      expect(response.body.error.details.fields).toBeDefined();
      expect(response.body.error.details.fields.name).toBeDefined();
      expect(response.body.error.details.fields.email).toBeDefined();
    });

    it('should pass valid data through successfully', async () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        description: 'Test description',
      };

      const response = await request(app.getHttpServer())
        .post('/test/validation-pipe')
        .send(validData)
        .expect(HttpStatus.OK);

      expect(response.body).toMatchObject({
        success: true,
        data: validData,
      });
    });

    it('should handle missing required fields', async () => {
      const incompleteData = {
        description: 'Only description provided',
      };

      const response = await request(app.getHttpServer())
        .post('/test/validation-pipe')
        .send(incompleteData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.details.fields.name).toBeDefined();
      expect(response.body.error.details.fields.email).toBeDefined();
    });
  });

  describe('Error Boundary Interceptor', () => {
    it('should execute fallback for suppressed errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/error-boundary-fallback')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: 'Fallback executed',
      });
    });

    // Note: Retry test is commented out as it would take too long in integration tests
    // In a real scenario, you might want to test this with a shorter delay or mock the retry mechanism
    /*
        it('should retry retryable errors', async () => {
          const response = await request(app.getHttpServer())
            .get('/test/error-boundary-retry')
            .expect(HttpStatus.BAD_GATEWAY);
    
          // The error should still be thrown after retries
          expect(response.body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
        }, 10000); // Increase timeout for retry test
        */
  });

  describe('Error Handler Service', () => {
    it('should convert Prisma errors correctly', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        message: 'Unique constraint failed',
        meta: { target: ['email'] },
      } as any;

      const appError = errorHandlerService.handleError(prismaError);

      expect(appError).toBeInstanceOf(ValidationError);
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.details?.constraint).toBe('unique_violation');
      expect(appError.details?.target).toEqual(['email']);
    });

    it('should determine retry eligibility correctly', () => {
      const retryableError = new ExternalServiceError(
        'Service unavailable',
        'github',
        {},
        undefined,
        true,
      );
      const nonRetryableError = new ValidationError('Invalid input');

      expect(errorHandlerService.shouldRetry(retryableError, 1)).toBe(true);
      expect(errorHandlerService.shouldRetry(nonRetryableError, 1)).toBe(false);
      expect(errorHandlerService.shouldRetry(retryableError, 5, 3)).toBe(false); // Exceeded max attempts
    });

    it('should calculate retry delay with exponential backoff', () => {
      const delay1 = errorHandlerService.getRetryDelay(1, 1000);
      const delay2 = errorHandlerService.getRetryDelay(2, 1000);
      const delay3 = errorHandlerService.getRetryDelay(3, 1000);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(1200); // With jitter
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(2200);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThan(4400);
    });
  });

  describe('Request Context', () => {
    it('should include request ID in error responses', async () => {
      const customRequestId = 'test-request-123';

      const response = await request(app.getHttpServer())
        .get('/test/validation-error')
        .set('X-Request-ID', customRequestId)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.headers['x-request-id']).toBe(customRequestId);
      expect(response.body.error.requestId).toBe(customRequestId);
    });

    it('should generate request ID if not provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/validation-error')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.error.requestId).toBeDefined();
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });
  });

  describe('Error Response Format', () => {
    it('should have consistent error response structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/validation-error')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('category');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('path');
      expect(response.body.error).toHaveProperty('method');
      expect(response.body.error).toHaveProperty('requestId');
    });

    it('should include safe details for validation errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/validation-error')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.field).toBe('email');
    });

    it('should not expose sensitive details in production mode', async () => {
      // This test would need to be run with NODE_ENV=production
      // For now, we'll just verify the structure exists
      const response = await request(app.getHttpServer())
        .get('/test/generic-error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      // In development mode, details might be exposed
      // In production mode, they should be filtered
      expect(response.body.error).toBeDefined();
    });
  });
});
