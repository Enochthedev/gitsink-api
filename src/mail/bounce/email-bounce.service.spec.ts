import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BounceEvent,
  ComplaintEvent,
  DeliveryEvent,
  EmailBounceService,
} from './email-bounce.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EmailBounceService', () => {
  let service: EmailBounceService;
  let prismaService: any;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailBounceService,
        {
          provide: PrismaService,
          useValue: {
            emailBounce: {
              create: jest.fn().mockResolvedValue({}),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            emailComplaint: {
              create: jest.fn().mockResolvedValue({}),
              count: jest.fn().mockResolvedValue(0),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            emailDelivery: {
              create: jest.fn().mockResolvedValue({}),
              count: jest.fn().mockResolvedValue(0),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            emailSuppression: {
              findUnique: jest.fn().mockResolvedValue(null),
              upsert: jest.fn().mockResolvedValue({}),
              update: jest.fn().mockResolvedValue({}),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
            },
            user: {
              count: jest.fn().mockResolvedValue(0),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailBounceService>(EmailBounceService);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        EMAIL_MAX_TRANSIENT_BOUNCES: 5,
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleBounce', () => {
    it('should handle permanent bounce correctly', async () => {
      const bounceEvent: BounceEvent = {
        messageId: 'test-message-id',
        email: 'test@example.com',
        bounceType: 'permanent',
        bounceSubType: 'general',
        timestamp: new Date(),
      };

      await service.handleBounce(bounceEvent);

      expect(prismaService.emailBounce.create).toHaveBeenCalledWith({
        data: {
          messageId: bounceEvent.messageId,
          email: bounceEvent.email,
          bounceType: bounceEvent.bounceType,
          bounceSubType: bounceEvent.bounceSubType,
          diagnosticCode: bounceEvent.diagnosticCode,
          feedbackId: bounceEvent.feedbackId,
          timestamp: bounceEvent.timestamp,
        },
      });

      expect(prismaService.emailSuppression.upsert).toHaveBeenCalledWith({
        where: { email: bounceEvent.email },
        update: {
          isActive: true,
          reason: `Permanent bounce: ${bounceEvent.bounceSubType}`,
          updatedAt: expect.any(Date),
        },
        create: {
          email: bounceEvent.email,
          isActive: true,
          reason: `Permanent bounce: ${bounceEvent.bounceSubType}`,
        },
      });
    });

    it('should handle transient bounce correctly', async () => {
      const bounceEvent: BounceEvent = {
        messageId: 'test-message-id',
        email: 'test@example.com',
        bounceType: 'transient',
        bounceSubType: 'general',
        timestamp: new Date(),
      };

      prismaService.emailBounce.findMany.mockResolvedValue([
        { bounceType: 'transient' },
        { bounceType: 'transient' },
        { bounceType: 'transient' },
      ]);

      await service.handleBounce(bounceEvent);

      expect(prismaService.emailBounce.create).toHaveBeenCalled();
      // Should not suppress email for few transient bounces
      expect(prismaService.emailSuppression.upsert).not.toHaveBeenCalled();
    });

    it('should suppress email after too many transient bounces', async () => {
      const bounceEvent: BounceEvent = {
        messageId: 'test-message-id',
        email: 'test@example.com',
        bounceType: 'transient',
        bounceSubType: 'general',
        timestamp: new Date(),
      };

      prismaService.emailBounce.findMany.mockResolvedValue(
        Array(6).fill({ bounceType: 'transient' }),
      );

      await service.handleBounce(bounceEvent);

      expect(prismaService.emailSuppression.upsert).toHaveBeenCalledWith({
        where: { email: bounceEvent.email },
        update: {
          isActive: true,
          reason: 'Too many transient bounces (6)',
          updatedAt: expect.any(Date),
        },
        create: {
          email: bounceEvent.email,
          isActive: true,
          reason: 'Too many transient bounces (6)',
        },
      });
    });
  });

  describe('handleComplaint', () => {
    it('should handle complaint correctly', async () => {
      const complaintEvent: ComplaintEvent = {
        messageId: 'test-message-id',
        email: 'test@example.com',
        complaintType: 'abuse',
        timestamp: new Date(),
      };

      await service.handleComplaint(complaintEvent);

      expect(prismaService.emailComplaint.create).toHaveBeenCalledWith({
        data: {
          messageId: complaintEvent.messageId,
          email: complaintEvent.email,
          complaintType: complaintEvent.complaintType,
          feedbackId: complaintEvent.feedbackId,
          userAgent: complaintEvent.userAgent,
          timestamp: complaintEvent.timestamp,
        },
      });

      expect(prismaService.emailSuppression.upsert).toHaveBeenCalledWith({
        where: { email: complaintEvent.email },
        update: {
          isActive: true,
          reason: 'complaint',
          updatedAt: expect.any(Date),
        },
        create: {
          email: complaintEvent.email,
          isActive: true,
          reason: 'complaint',
        },
      });
    });
  });

  describe('handleDelivery', () => {
    it('should handle delivery correctly', async () => {
      const deliveryEvent: DeliveryEvent = {
        messageId: 'test-message-id',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      prismaService.emailSuppression.findUnique.mockResolvedValue({
        isActive: true,
        reason: 'transient bounce',
      });

      await service.handleDelivery(deliveryEvent);

      expect(prismaService.emailDelivery.create).toHaveBeenCalledWith({
        data: {
          messageId: deliveryEvent.messageId,
          email: deliveryEvent.email,
          timestamp: deliveryEvent.timestamp,
          processingTimeMillis: deliveryEvent.processingTimeMillis,
          smtpResponse: deliveryEvent.smtpResponse,
        },
      });

      // Should clear transient bounce suppression
      expect(prismaService.emailSuppression.update).toHaveBeenCalledWith({
        where: { email: deliveryEvent.email },
        data: {
          isActive: false,
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('isEmailSuppressed', () => {
    it('should return true for suppressed email', async () => {
      prismaService.emailSuppression.findUnique.mockResolvedValue({
        isActive: true,
      });

      const result = await service.isEmailSuppressed('test@example.com');

      expect(result).toBe(true);
      expect(prismaService.emailSuppression.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return false for non-suppressed email', async () => {
      prismaService.emailSuppression.findUnique.mockResolvedValue({
        isActive: false,
      });

      const result = await service.isEmailSuppressed('test@example.com');

      expect(result).toBe(false);
    });

    it('should return false for non-existent suppression record', async () => {
      prismaService.emailSuppression.findUnique.mockResolvedValue(null);

      const result = await service.isEmailSuppressed('test@example.com');

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      prismaService.emailSuppression.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await service.isEmailSuppressed('test@example.com');

      expect(result).toBe(false);
    });
  });

  describe('getBounceStats', () => {
    it('should return correct bounce statistics', async () => {
      const mockBounces = [
        { bounceType: 'permanent', createdAt: new Date() },
        { bounceType: 'transient', createdAt: new Date() },
        { bounceType: 'transient', createdAt: new Date() },
      ];

      prismaService.emailBounce.findMany.mockResolvedValue(mockBounces);

      const stats = await service.getBounceStats('test@example.com');

      expect(stats).toEqual({
        totalBounces: 3,
        permanentBounces: 1,
        transientBounces: 2,
        lastBounceAt: mockBounces[0].createdAt,
      });
    });

    it('should handle empty bounce history', async () => {
      prismaService.emailBounce.findMany.mockResolvedValue([]);

      const stats = await service.getBounceStats('test@example.com');

      expect(stats).toEqual({
        totalBounces: 0,
        permanentBounces: 0,
        transientBounces: 0,
        lastBounceAt: undefined,
      });
    });
  });

  describe('getDeliveryStats', () => {
    it('should return correct delivery statistics', async () => {
      const timeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
      };

      prismaService.emailDelivery.count.mockResolvedValue(90);
      prismaService.emailBounce.count.mockResolvedValue(10);
      prismaService.emailComplaint.count.mockResolvedValue(2);

      const stats = await service.getDeliveryStats(timeRange);

      expect(stats).toEqual({
        totalSent: 100,
        totalDelivered: 90,
        totalBounced: 10,
        totalComplaints: 2,
        deliveryRate: 90,
        bounceRate: 10,
        complaintRate: expect.closeTo(2.22, 1), // 2/90 * 100
      });
    });
  });

  describe('cleanupOldRecords', () => {
    it('should cleanup old records correctly', async () => {
      prismaService.emailBounce.deleteMany.mockResolvedValue({ count: 10 });
      prismaService.emailComplaint.deleteMany.mockResolvedValue({ count: 5 });
      prismaService.emailDelivery.deleteMany.mockResolvedValue({ count: 100 });

      const result = await service.cleanupOldRecords(90);

      expect(result).toEqual({
        bouncesDeleted: 10,
        complaintsDeleted: 5,
        deliveriesDeleted: 100,
      });

      expect(prismaService.emailBounce.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });
  });
});
