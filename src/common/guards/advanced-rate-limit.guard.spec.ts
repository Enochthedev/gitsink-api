import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdvancedRateLimitGuard, AdvancedRateLimitOptions } from './advanced-rate-limit.guard';
import { RateLimitingService } from '../services/rate-limiting.service';
import { RequestWithUser } from '@auth/request-with-user';

describe('AdvancedRateLimitGuard', () => {
  let guard: AdvancedRateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let rateLimitingService: jest.Mocked<RateLimitingService>;

  beforeEach(async () => {
    const mockReflector = {
      get: jest.fn(),
    };

    const mockRateLimitingService = {
      checkRateLimit: jest.fn(),
      hasPremiumBypass: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedRateLimitGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: RateLimitingService,
          useValue: mockRateLimitingService,
        },
      ],
    }).compile();

    guard = module.get<AdvancedRateLimitGuard>(AdvancedRateLimitGuard);
    reflector = module.get(Reflector);
    rateLimitingService = module.get(RateLimitingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    request: Partial<RequestWithUser> = {},
    options: AdvancedRateLimitOptions | null = null,
  ): ExecutionContext => {
    const mockRequest = {
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' },
      method: 'GET',
      url: '/api/test',
      route: { path: '/api/test' },
      get: jest.fn().mockReturnValue('localhost'),
      user: null,
      ...request,
    };

    const mockResponse = {
      setHeader: jest.fn(),
    };

    reflector.get.mockReturnValue(options);

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: () => ({}),
    } as any;
  };

  describe('canActivate', () => {
    it('should allow request when no rate limit decorator is present', async () => {
      // Arrange
      const context = createMockExecutionContext({}, null);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(rateLimitingService.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should allow request when under rate limit', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const context = createMockExecutionContext({}, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalledWith(
        'ip:192.168.1.1',
        'GET /api/test',
        'free',
        undefined,
      );
    });

    it('should block request when over rate limit', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
        message: 'Custom rate limit message',
      };
      const context = createMockExecutionContext({}, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + 30000),
        retryAfter: 30,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Custom rate limit message',
          error: 'Too Many Requests',
          retryAfter: 30,
          resetTime: expect.any(Date),
        });
      }
    });

    it('should use user ID as identifier when user is authenticated', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const request = {
        user: { id: 'user-123', tier: 'premium' },
      };
      const context = createMockExecutionContext(request, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalledWith(
        'user:user-123',
        'GET /api/test',
        'premium',
        'user-123',
      );
    });

    it('should bypass rate limit for premium users when configured', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
        bypassPremium: true,
      };
      const request = {
        user: { id: 'user-123', tier: 'premium' },
      };
      const context = createMockExecutionContext(request, options);

      rateLimitingService.hasPremiumBypass.mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(rateLimitingService.hasPremiumBypass).toHaveBeenCalledWith('user-123');
      expect(rateLimitingService.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should not bypass rate limit for non-premium users', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
        bypassPremium: true,
      };
      const request = {
        user: { id: 'user-123', tier: 'free' },
      };
      const context = createMockExecutionContext(request, options);

      rateLimitingService.hasPremiumBypass.mockResolvedValue(false);
      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(rateLimitingService.hasPremiumBypass).toHaveBeenCalledWith('user-123');
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalled();
    });

    it('should use custom key generator when provided', async () => {
      // Arrange
      const customKeyGenerator = jest.fn().mockReturnValue('custom:key');
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
        keyGenerator: customKeyGenerator,
      };
      const context = createMockExecutionContext({}, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(customKeyGenerator).toHaveBeenCalled();
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalledWith(
        'custom:key',
        'GET /api/test',
        'free',
        undefined,
      );
    });

    it('should set rate limit headers in response', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const context = createMockExecutionContext({}, options);
      const mockResponse = context.switchToHttp().getResponse();

      const resetTime = new Date(Date.now() + 60000);
      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime,
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '50');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        Math.ceil(resetTime.getTime() / 1000).toString(),
      );
    });

    it('should set retry-after header when rate limited', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const context = createMockExecutionContext({}, options);
      const mockResponse = context.switchToHttp().getResponse();

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + 30000),
        retryAfter: 30,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '30');
      }
    });

    it('should handle missing IP address gracefully', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const request = {
        ip: undefined,
        connection: undefined,
        socket: undefined,
      };
      const context = createMockExecutionContext(request, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalledWith(
        'ip:unknown',
        'GET /api/test',
        'free',
        undefined,
      );
    });

    it('should use default message when none provided', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const context = createMockExecutionContext({}, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + 30000),
        retryAfter: 30,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error.getResponse().message).toBe('Too many requests. Please try again later.');
      }
    });

    it('should handle route path extraction when route is not available', async () => {
      // Arrange
      const options: AdvancedRateLimitOptions = {
        maxRequests: 100,
        windowMs: 60000,
      };
      const request = {
        route: undefined,
        url: '/api/test?param=value',
        get: jest.fn().mockReturnValue('localhost'),
      };
      const context = createMockExecutionContext(request, options);

      rateLimitingService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: new Date(Date.now() + 60000),
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(rateLimitingService.checkRateLimit).toHaveBeenCalledWith(
        'ip:192.168.1.1',
        'GET /api/test',
        'free',
        undefined,
      );
    });
  });
});
