import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface BounceEvent {
  messageId: string;
  email: string;
  bounceType: 'permanent' | 'transient';
  bounceSubType: string;
  timestamp: Date;
  diagnosticCode?: string;
  feedbackId?: string;
}

export interface ComplaintEvent {
  messageId: string;
  email: string;
  complaintType: 'abuse' | 'fraud' | 'virus' | 'other';
  timestamp: Date;
  feedbackId?: string;
  userAgent?: string;
}

export interface DeliveryEvent {
  messageId: string;
  email: string;
  timestamp: Date;
  processingTimeMillis?: number;
  smtpResponse?: string;
}

@Injectable()
export class EmailBounceService {
  private readonly logger = new Logger(EmailBounceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Handle email bounce events
   */
  async handleBounce(bounceEvent: BounceEvent): Promise<void> {
    try {
      this.logger.warn(`Email bounce received for ${bounceEvent.email}`, {
        messageId: bounceEvent.messageId,
        bounceType: bounceEvent.bounceType,
        bounceSubType: bounceEvent.bounceSubType,
      });

      // Record bounce in database
      await this.recordBounce(bounceEvent);

      // Handle permanent bounces
      if (bounceEvent.bounceType === 'permanent') {
        await this.handlePermanentBounce(bounceEvent);
      }

      // Handle transient bounces
      if (bounceEvent.bounceType === 'transient') {
        await this.handleTransientBounce(bounceEvent);
      }

      this.logger.log(`Successfully processed bounce for ${bounceEvent.email}`);
    } catch (error) {
      this.logger.error(`Failed to handle bounce for ${bounceEvent.email}:`, error);
      throw error;
    }
  }

  /**
   * Handle email complaint events
   */
  async handleComplaint(complaintEvent: ComplaintEvent): Promise<void> {
    try {
      this.logger.warn(`Email complaint received for ${complaintEvent.email}`, {
        messageId: complaintEvent.messageId,
        complaintType: complaintEvent.complaintType,
      });

      // Record complaint in database
      await this.recordComplaint(complaintEvent);

      // Automatically suppress email for complaints
      await this.suppressEmail(complaintEvent.email, 'complaint');

      this.logger.log(`Successfully processed complaint for ${complaintEvent.email}`);
    } catch (error) {
      this.logger.error(`Failed to handle complaint for ${complaintEvent.email}:`, error);
      throw error;
    }
  }

  /**
   * Handle successful delivery events
   */
  async handleDelivery(deliveryEvent: DeliveryEvent): Promise<void> {
    try {
      this.logger.log(`Email delivered successfully to ${deliveryEvent.email}`, {
        messageId: deliveryEvent.messageId,
        processingTime: deliveryEvent.processingTimeMillis,
      });

      // Record successful delivery
      await this.recordDelivery(deliveryEvent);

      // Clear any transient bounce flags for this email
      await this.clearTransientBounceFlags(deliveryEvent.email);
    } catch (error) {
      this.logger.error(`Failed to handle delivery for ${deliveryEvent.email}:`, error);
      // Don't throw error for delivery events as they're informational
    }
  }

  /**
   * Check if an email address is suppressed
   */
  async isEmailSuppressed(email: string): Promise<boolean> {
    try {
      const suppression = await this.prisma.emailSuppression.findUnique({
        where: { email },
      });

      return suppression?.isActive ?? false;
    } catch (error) {
      this.logger.error(`Failed to check suppression status for ${email}:`, error);
      // Return false to allow email sending in case of database issues
      return false;
    }
  }

  /**
   * Get bounce statistics for an email address
   */
  async getBounceStats(email: string): Promise<{
    totalBounces: number;
    permanentBounces: number;
    transientBounces: number;
    lastBounceAt?: Date;
  }> {
    try {
      const bounces = await this.prisma.emailBounce.findMany({
        where: { email },
        orderBy: { createdAt: 'desc' },
      });

      return {
        totalBounces: bounces.length,
        permanentBounces: bounces.filter(b => b.bounceType === 'permanent').length,
        transientBounces: bounces.filter(b => b.bounceType === 'transient').length,
        lastBounceAt: bounces[0]?.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get bounce stats for ${email}:`, error);
      return {
        totalBounces: 0,
        permanentBounces: 0,
        transientBounces: 0,
      };
    }
  }

  /**
   * Manually suppress an email address
   */
  async suppressEmail(email: string, reason: string): Promise<void> {
    try {
      await this.prisma.emailSuppression.upsert({
        where: { email },
        update: {
          isActive: true,
          reason,
          updatedAt: new Date(),
        },
        create: {
          email,
          isActive: true,
          reason,
        },
      });

      this.logger.log(`Email ${email} suppressed due to: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to suppress email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Remove email suppression
   */
  async unsuppressEmail(email: string): Promise<void> {
    try {
      await this.prisma.emailSuppression.update({
        where: { email },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Email suppression removed for ${email}`);
    } catch (error) {
      this.logger.error(`Failed to unsuppress email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Get suppression list with pagination
   */
  async getSuppressionList(
    options: {
      page?: number;
      limit?: number;
      reason?: string;
      isActive?: boolean;
    } = {},
  ): Promise<{
    suppressions: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 50, reason, isActive } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (reason) where.reason = { contains: reason, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive;

    try {
      const [suppressions, total] = await Promise.all([
        this.prisma.emailSuppression.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.emailSuppression.count({ where }),
      ]);

      return { suppressions, total, page, limit };
    } catch (error) {
      this.logger.error('Failed to get suppression list:', error);
      throw error;
    }
  }

  /**
   * Clean up old bounce records
   */
  async cleanupOldRecords(daysToKeep: number = 90): Promise<{
    bouncesDeleted: number;
    complaintsDeleted: number;
    deliveriesDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const [bouncesDeleted, complaintsDeleted, deliveriesDeleted] = await Promise.all([
        this.prisma.emailBounce.deleteMany({
          where: { createdAt: { lt: cutoffDate } },
        }),
        this.prisma.emailComplaint.deleteMany({
          where: { createdAt: { lt: cutoffDate } },
        }),
        this.prisma.emailDelivery.deleteMany({
          where: { createdAt: { lt: cutoffDate } },
        }),
      ]);

      this.logger.log(
        `Cleaned up old email records: ${bouncesDeleted.count} bounces, ${complaintsDeleted.count} complaints, ${deliveriesDeleted.count} deliveries`,
      );

      return {
        bouncesDeleted: bouncesDeleted.count,
        complaintsDeleted: complaintsDeleted.count,
        deliveriesDeleted: deliveriesDeleted.count,
      };
    } catch (error) {
      this.logger.error('Failed to cleanup old email records:', error);
      throw error;
    }
  }

  /**
   * Get email delivery statistics
   */
  async getDeliveryStats(timeRange: { start: Date; end: Date }): Promise<{
    totalSent: number;
    totalDelivered: number;
    totalBounced: number;
    totalComplaints: number;
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
  }> {
    try {
      const [deliveries, bounces, complaints] = await Promise.all([
        this.prisma.emailDelivery.count({
          where: {
            timestamp: {
              gte: timeRange.start,
              lte: timeRange.end,
            },
          },
        }),
        this.prisma.emailBounce.count({
          where: {
            timestamp: {
              gte: timeRange.start,
              lte: timeRange.end,
            },
          },
        }),
        this.prisma.emailComplaint.count({
          where: {
            timestamp: {
              gte: timeRange.start,
              lte: timeRange.end,
            },
          },
        }),
      ]);

      const totalSent = deliveries + bounces;
      const deliveryRate = totalSent > 0 ? (deliveries / totalSent) * 100 : 0;
      const bounceRate = totalSent > 0 ? (bounces / totalSent) * 100 : 0;
      const complaintRate = deliveries > 0 ? (complaints / deliveries) * 100 : 0;

      return {
        totalSent,
        totalDelivered: deliveries,
        totalBounced: bounces,
        totalComplaints: complaints,
        deliveryRate,
        bounceRate,
        complaintRate,
      };
    } catch (error) {
      this.logger.error('Failed to get delivery stats:', error);
      throw error;
    }
  }

  private async recordBounce(bounceEvent: BounceEvent): Promise<void> {
    await this.prisma.emailBounce.create({
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
  }

  private async recordComplaint(complaintEvent: ComplaintEvent): Promise<void> {
    await this.prisma.emailComplaint.create({
      data: {
        messageId: complaintEvent.messageId,
        email: complaintEvent.email,
        complaintType: complaintEvent.complaintType,
        feedbackId: complaintEvent.feedbackId,
        userAgent: complaintEvent.userAgent,
        timestamp: complaintEvent.timestamp,
      },
    });
  }

  private async recordDelivery(deliveryEvent: DeliveryEvent): Promise<void> {
    await this.prisma.emailDelivery.create({
      data: {
        messageId: deliveryEvent.messageId,
        email: deliveryEvent.email,
        timestamp: deliveryEvent.timestamp,
        processingTimeMillis: deliveryEvent.processingTimeMillis,
        smtpResponse: deliveryEvent.smtpResponse,
      },
    });
  }

  private async handlePermanentBounce(bounceEvent: BounceEvent): Promise<void> {
    // Suppress email for permanent bounces
    await this.suppressEmail(bounceEvent.email, `Permanent bounce: ${bounceEvent.bounceSubType}`);

    // Log permanent bounce for user records
    try {
      const userCount = await this.prisma.user.count({
        where: { email: bounceEvent.email },
      });
      if (userCount > 0) {
        this.logger.warn(`User with permanently bounced email found: ${bounceEvent.email}`);
      }
    } catch (error) {
      // User might not exist, which is fine
      this.logger.debug(`No user found for bounced email ${bounceEvent.email}`);
    }
  }

  private async handleTransientBounce(bounceEvent: BounceEvent): Promise<void> {
    const stats = await this.getBounceStats(bounceEvent.email);

    // Suppress email if too many transient bounces
    const maxTransientBounces = this.configService.get<number>('EMAIL_MAX_TRANSIENT_BOUNCES', 5);

    if (stats.transientBounces >= maxTransientBounces) {
      await this.suppressEmail(
        bounceEvent.email,
        `Too many transient bounces (${stats.transientBounces})`,
      );
    }
  }

  private async clearTransientBounceFlags(email: string): Promise<void> {
    // If email was suppressed due to transient bounces, unsuppress it
    try {
      const suppression = await this.prisma.emailSuppression.findUnique({
        where: { email },
      });

      if (suppression?.isActive && suppression.reason?.includes('transient')) {
        await this.unsuppressEmail(email);
      }
    } catch (error) {
      this.logger.error(`Failed to clear transient bounce flags for ${email}:`, error);
    }
  }
}
