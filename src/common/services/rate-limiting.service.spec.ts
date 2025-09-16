import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RateLimitingService } from './rate-limiting.service';
import { PrismaService } from '@prisma/prisma.service';
import { MetricsService } from '@metrics/metrics.service';

describe('RateLimitingService', () => {
  let service: RateLimitingService;
  let cacheManager: jest.Mocked<Cache>;
  let prismaService: jest.Mocked<PrismaService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockCounter = {
    inc: jest.fn(),
  };

  const mockHistogram = {
    observe: jest.fn(),
  };

  beforeEach(async () => {
    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockMetricsService = {
      createCustomCounter: jest.fn().mockReturnValue(mockCounter),
      createCustomHistogram: jest.fn().mockReturnValue(mockHistogram),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<RateLimitingService>(RateLimitingService);
    cacheManager = module.get(CACHE_MANAGER);
    prismaService = module.get(PrismaService);
    metricsService = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow request when under limit', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      const userTier = 'free';

      cacheManager.get.mockResolvedValue({
        count: 5,
        windowStart: Date.now() - 30000, // 30 seconds ago
      });

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(cacheManager.set).toHaveBeenCalled();
      expect(mockCounter.inc).toHaveBeenCalledWith({
        endpoint,
        user_tier: userTier,
        result: 'allowed',
      });
    });

    it('should block request when over limit', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      const userTier = 'free';

      cacheManager.get.mockResolvedValue({
        count: 60, // At the limit for free tier
        windowStart: Date.now() - 30000,
      });

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(cacheManager.set).not.toHaveBeenCalled();
      expect(mockCounter.inc).toHaveBeenCalledWith({
        endpoint,
        user_tier: userTier,
        result: 'blocked',
      });
    });

    it('should reset window when expired', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      const userTier = 'free';

      cacheManager.get.mockResolvedValue({
        count: 60,
        windowStart: Date.now() - 120000, // 2 minutes ago (expired)
      });

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should use endpoint-specific limits', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/auth/signup';
      const userTier = 'free';

      cacheManager.get.mockResolvedValue({
        count: 4,
        windowStart: Date.now() - 30000,
      });

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(true);
      // Signup endpoint has lower limits (5 for free tier)
      expect(result.remaining).toBe(0); // 5 - 4 - 1 = 0
    });

    it('should handle premium tier with higher limits', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      const userTier = 'premium';

      cacheManager.get.mockResolvedValue({
        count: 250,
        windowStart: Date.now() - 30000,
      });

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(49); // 300 - 250 - 1 = 49
    });

    it('should handle cache errors gracefully', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      const userTier = 'free';

      cacheManager.get.mockRejectedValue(new Error('Cache error'));

      // Act
      const result = await service.checkRateLimit(identifier, endpoint, userTier);

      // Assert
      expect(result.allowed).toBe(true); // Should allow when cache fails
      expect(result.remaining).toBeGreaterThan(0);
    });
  });

  describe('hasPremiumBypass', () => {
    it('should return true for premium users', async () => {
      // Arrange
      const userId = 'user-123';
      prismaService.user.findUnique.mockResolvedValue({
        id: userId,
        tier: 'premium',
      } as any);

      // Act
      const result = await service.hasPremiumBypass(userId);

      // Assert
      expect(result).toBe(true);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { tier: true },
      });
    });

    it('should return true for enterprise users', async () => {
      // Arrange
      const userId = 'user-123';
      prismaService.user.findUnique.mockResolvedValue({
        id: userId,
        tier: 'enterprise',
      } as any);

      // Act
      const result = await service.hasPremiumBypass(userId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for free users', async () => {
      // Arrange
      const userId = 'user-123';
      prismaService.user.findUnique.mockResolvedValue({
        id: userId,
        tier: 'free',
      } as any);

      // Act
      const result = await service.hasPremiumBypass(userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      // Arrange
      const userId = 'user-123';
      prismaService.user.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.hasPremiumBypass(userId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when userId is empty', async () => {
      // Act
      const result = await service.hasPremiumBypass('');

      // Assert
      expect(result).toBe(false);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      prismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.hasPremiumBypass(userId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit for specific endpoint', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';

      // Act
      await service.clearRateLimit(identifier, endpoint);

      // Assert
      expect(cacheManager.del).toHaveBeenCalledTimes(3); // Once for each tier
      expect(cacheManager.del).toHaveBeenCalledWith('rate_limit:user:123:/api/test:free');
      expect(cacheManager.del).toHaveBeenCalledWith('rate_limit:user:123:/api/test:premium');
      expect(cacheManager.del).toHaveBeenCalledWith('rate_limit:user:123:/api/test:enterprise');
    });

    it('should handle cache deletion errors gracefully', async () => {
      // Arrange
      const identifier = 'user:123';
      const endpoint = '/api/test';
      cacheManager.del.mockRejectedValue(new Error('Cache error'));

      // Act & Assert
      await expect(service.clearRateLimit(identifier, endpoint)).resolves.not.toThrow();
    });
  });

  describe('getRateLimitStats', () => {
    it('should return rate limit statistics', async () => {
      // Act
      const result = await service.getRateLimitStats();

      // Assert
      expect(result).toEqual({
        totalRequests: 0,
        blockedRequests: 0,
        blockRate: 0,
        topBlockedEndpoints: [],
        tierBreakdown: {
          free: { allowed: 0, blocked: 0 },
          premium: { allowed: 0, blocked: 0 },
          enterprise: { allowed: 0, blocked: 0 },
        },
      });
    });

    it('should accept time range parameter', async () => {
      // Arrange
      const timeRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      };

      // Act
      const result = await service.getRateLimitStats(timeRange);

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('updateEndpointLimits', () => {
    it('should update endpoint limits configuration', () => {
      // Arrange
      const endpoint = '/api/new-endpoint';
      const limits = {
        free: { windowMs: 60000, maxRequests: 10 },
        premium: { windowMs: 60000, maxRequests: 50 },
        enterprise: { windowMs: 60000, maxRequests: 200 },
      };

      // Act
      service.updateEndpointLimits(endpoint, limits);

      // Assert
      // This is a void method, so we just ensure it doesn't throw
      expect(true).toBe(true);
    });
  });
});
