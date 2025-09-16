import { Test, TestingModule } from '@nestjs/testing';
import { ErrorHandlerService } from './error-handler.service';
import {
    AppError,
    ValidationError,
    ExternalServiceError,
    DatabaseError,
    ErrorCategory
} from './app-error';
import { Prisma } from '@prisma/client';
import { AxiosError } from 'axios';
import { ThrottlerException } from '@nestjs/throttler';

describe('ErrorHandlerService', () => {
    let service: ErrorHandlerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ErrorHandlerService],
        }).compile();

        service = module.get<ErrorHandlerService>(ErrorHandlerService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('handleError', () => {
        it('should return AppError as-is if already an AppError', () => {
            const originalError = new ValidationError('Test validation error');
            const result = service.handleError(originalError);

            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('VALIDATION_ERROR');
            expect(result.message).toBe('Test validation error');
        });

        it('should handle Prisma unique constraint violation (P2002)', () => {
            const prismaError = Object.assign(new Error('Unique constraint failed'), {
                name: 'PrismaClientKnownRequestError',
                code: 'P2002',
                meta: { target: ['email'] },
                clientVersion: '5.0.0',
            }) as unknown as Prisma.PrismaClientKnownRequestError;

            const result = service.handleError(prismaError);

            expect(result).toBeInstanceOf(ValidationError);
            expect(result.code).toBe('VALIDATION_ERROR');
            expect(result.details?.constraint).toBe('unique_violation');
            expect(result.details?.target).toEqual(['email']);
        });

        it('should handle Prisma record not found (P2025)', () => {
            const prismaError = Object.assign(new Error('Record not found'), {
                name: 'PrismaClientKnownRequestError',
                code: 'P2025',
                meta: {},
                clientVersion: '5.0.0',
            }) as unknown as Prisma.PrismaClientKnownRequestError;

            const result = service.handleError(prismaError);

            expect(result.code).toBe('RECORD_NOT_FOUND');
            expect(result.category).toBe(ErrorCategory.BUSINESS_LOGIC);
        });

        it('should handle Axios network errors', () => {
            const axiosError = {
                name: 'AxiosError',
                message: 'Network Error',
                config: { url: 'https://api.github.com/repos/user/repo' },
                request: {},
                response: undefined,
            } as AxiosError;

            const result = service.handleError(axiosError);

            expect(result).toBeInstanceOf(ExternalServiceError);
            expect(result.code).toBe('EXTERNAL_SERVICE_ERROR');
            expect(result.retryable).toBe(true);
            expect(result.details?.service).toBe('github');
        });

        it('should handle Axios response errors', () => {
            const axiosError = {
                name: 'AxiosError',
                message: 'Request failed with status code 404',
                config: { url: 'https://api.github.com/repos/user/repo', method: 'get' },
                response: {
                    status: 404,
                    statusText: 'Not Found',
                    data: { message: 'Repository not found' },
                },
            } as AxiosError;

            const result = service.handleError(axiosError);

            expect(result).toBeInstanceOf(ExternalServiceError);
            expect(result.details?.status).toBe(404);
            expect(result.details?.method).toBe('GET');
            expect(result.retryable).toBe(false); // 404 is not retryable
        });

        it('should handle ThrottlerException', () => {
            const throttlerError = new ThrottlerException();

            const result = service.handleError(throttlerError);

            expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
        });

        it('should handle generic errors', () => {
            const genericError = new Error('Something went wrong');

            const result = service.handleError(genericError);

            expect(result.code).toBe('SYSTEM_ERROR');
            expect(result.category).toBe(ErrorCategory.SYSTEM);
            expect(result.message).toBe('Something went wrong');
        });
    });

    describe('shouldRetry', () => {
        it('should return true for retryable errors within attempt limit', () => {
            const retryableError = new ExternalServiceError('Service unavailable', 'github', {}, undefined, true);

            expect(service.shouldRetry(retryableError, 1, 3)).toBe(true);
            expect(service.shouldRetry(retryableError, 2, 3)).toBe(true);
        });

        it('should return false when max attempts exceeded', () => {
            const retryableError = new ExternalServiceError('Service unavailable', 'github', {}, undefined, true);

            expect(service.shouldRetry(retryableError, 3, 3)).toBe(false);
            expect(service.shouldRetry(retryableError, 4, 3)).toBe(false);
        });

        it('should return false for non-retryable errors', () => {
            const nonRetryableError = new ValidationError('Invalid input');

            expect(service.shouldRetry(nonRetryableError, 1, 3)).toBe(false);
        });

        it('should return false for validation and authentication errors', () => {
            const validationError = new ValidationError('Invalid input');
            const authError = new AppError({
                message: 'Unauthorized',
                code: 'AUTH_ERROR',
                category: ErrorCategory.AUTHENTICATION,
                statusCode: 401,
                retryable: true, // Even if marked retryable, auth errors shouldn't retry
            });

            expect(service.shouldRetry(validationError, 1, 3)).toBe(false);
            expect(service.shouldRetry(authError, 1, 3)).toBe(false);
        });
    });

    describe('getRetryDelay', () => {
        it('should calculate exponential backoff delay', () => {
            const baseDelay = 1000;

            const delay1 = service.getRetryDelay(1, baseDelay);
            const delay2 = service.getRetryDelay(2, baseDelay);
            const delay3 = service.getRetryDelay(3, baseDelay);

            // First attempt: ~1000ms (with jitter)
            expect(delay1).toBeGreaterThanOrEqual(1000);
            expect(delay1).toBeLessThan(1200);

            // Second attempt: ~2000ms (with jitter)
            expect(delay2).toBeGreaterThanOrEqual(2000);
            expect(delay2).toBeLessThan(2200);

            // Third attempt: ~4000ms (with jitter)
            expect(delay3).toBeGreaterThanOrEqual(4000);
            expect(delay3).toBeLessThan(4400);
        });

        it('should respect maximum delay', () => {
            const baseDelay = 1000;
            const maxDelay = 5000;

            const delay = service.getRetryDelay(10, baseDelay, maxDelay);

            expect(delay).toBeLessThanOrEqual(maxDelay);
        });

        it('should add jitter to prevent thundering herd', () => {
            const baseDelay = 1000;

            // Generate multiple delays and ensure they're not identical
            const delays = Array.from({ length: 10 }, () => service.getRetryDelay(1, baseDelay));
            const uniqueDelays = new Set(delays);

            // With jitter, we should get different values
            expect(uniqueDelays.size).toBeGreaterThan(1);
        });
    });

    describe('logError', () => {
        it('should log error without throwing', () => {
            const error = new ValidationError('Test error');

            // Should not throw
            expect(() => service.logError(error, 'test-context')).not.toThrow();
        });
    });
});