import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TiersService } from './tiers.service';
import {
  BillingCycle,
  SubscriptionResponseDto,
  SubscriptionStatus,
  UpgradeTierDto,
  UsageResponseDto,
} from './dto/subscription.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiersService: TiersService,
  ) {}

  /**
   * Get current subscription for a user
   */
  async getCurrentSubscription(userId: string): Promise<SubscriptionResponseDto | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      return null;
    }

    return this.toSubscriptionResponse(subscription);
  }

  /**
   * Create a free subscription for a new user
   */
  async createFreeSubscription(userId: string): Promise<SubscriptionResponseDto> {
    const freeTierId = await this.tiersService.getFreeTierId();
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 100); // Free tier doesn't expire

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        tierId: freeTierId,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      include: { tier: true },
    });

    return this.toSubscriptionResponse(subscription);
  }

  /**
   * Upgrade to a new tier
   * Note: This creates a checkout session. Actual upgrade happens via webhook.
   */
  async upgradeTier(
    userId: string,
    dto: UpgradeTierDto,
  ): Promise<{
    checkoutUrl?: string;
    subscription?: SubscriptionResponseDto;
    message: string;
  }> {
    const tier = await this.tiersService.getTierByName(dto.tierName);
    if (!tier) {
      throw new NotFoundException(`Tier '${dto.tierName}' not found`);
    }

    const currentSubscription = await this.getCurrentSubscription(userId);

    // If upgrading to free, just update directly
    if (tier.name === 'free') {
      const freeTierId = await this.tiersService.getFreeTierId();
      const now = new Date();
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 100);

      const subscription = await this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          tierId: freeTierId,
          status: 'active',
          billingCycle: 'monthly',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          tierId: freeTierId,
          status: 'active',
          cancelAtPeriodEnd: false,
          canceledAt: null,
          cancelReason: null,
          paymentProvider: null,
          externalSubscriptionId: null,
        },
        include: { tier: true },
      });

      return {
        subscription: this.toSubscriptionResponse(subscription),
        message: 'Successfully switched to free tier',
      };
    }

    // For paid tiers, we need payment integration
    // Return info about what payment provider to use
    const billingCycle = dto.billingCycle || BillingCycle.MONTHLY;
    const price = billingCycle === BillingCycle.YEARLY ? tier.yearlyPrice : tier.monthlyPrice;

    // This would normally integrate with payment providers
    // For now, we'll return a message about starting checkout
    return {
      message: `To upgrade to ${tier.displayName} ($${price}/${billingCycle}), please use the billing checkout endpoint with your preferred payment provider.`,
      checkoutUrl: undefined, // This would be populated by billing service
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    userId: string,
    reason?: string,
    immediate: boolean = false,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    // If it's a free tier, can't cancel
    if (subscription.tier.name === 'free') {
      throw new BadRequestException('Cannot cancel a free subscription');
    }

    const updateData: any = {
      canceledAt: new Date(),
      cancelReason: reason,
    };

    if (immediate) {
      // Downgrade to free immediately
      const freeTierId = await this.tiersService.getFreeTierId();
      updateData.tierId = freeTierId;
      updateData.status = 'active';
      updateData.cancelAtPeriodEnd = false;
    } else {
      updateData.cancelAtPeriodEnd = true;
      updateData.status = 'canceled';
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: updateData,
      include: { tier: true },
    });

    return this.toSubscriptionResponse(updated);
  }

  /**
   * Resume a canceled subscription
   */
  async resumeSubscription(userId: string): Promise<SubscriptionResponseDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new BadRequestException('Subscription is not set to cancel');
    }

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
        cancelReason: null,
        status: 'active',
      },
      include: { tier: true },
    });

    return this.toSubscriptionResponse(updated);
  }

  /**
   * Get usage statistics for current billing period
   */
  async getUsage(userId: string): Promise<UsageResponseDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    // Get actual usage counts
    const [projectCount, apiKeyCount] = await Promise.all([
      this.prisma.project.count({ where: { ownerId: userId, deletedAt: null } }),
      this.prisma.apiKeyToken.count({ where: { userId, revokedAt: null, isActive: true } }),
    ]);

    const tier = subscription.tier;
    const apiCallsUsed = subscription.currentApiCalls;
    const storageUsed = subscription.currentStorage;

    const calcPercentage = (used: number, limit: number) => {
      if (limit === -1) return 0; // Unlimited
      if (limit === 0) return 100;
      return Math.round((used / limit) * 100);
    };

    return {
      apiCallsUsed,
      apiCallsLimit: tier.apiCallsPerMonth,
      apiCallsPercentage: calcPercentage(apiCallsUsed, tier.apiCallsPerMonth),
      projectsUsed: projectCount,
      projectsLimit: tier.projectLimit,
      projectsPercentage: calcPercentage(projectCount, tier.projectLimit),
      apiKeysUsed: apiKeyCount,
      apiKeysLimit: tier.apiKeyLimit,
      apiKeysPercentage: calcPercentage(apiKeyCount, tier.apiKeyLimit),
      storageUsed,
      storageLimit: tier.storageLimit,
      storagePercentage: calcPercentage(storageUsed, tier.storageLimit),
      resetDate: subscription.currentPeriodEnd,
    };
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeature(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      return false;
    }

    // Check boolean feature flags
    const booleanFeatures: Record<string, boolean> = {
      aiEnrichment: subscription.tier.aiEnrichment,
      customDomain: subscription.tier.customDomain,
      prioritySupport: subscription.tier.prioritySupport,
      analytics: subscription.tier.analytics,
      exportData: subscription.tier.exportData,
      whiteLabel: subscription.tier.whiteLabel,
      sso: subscription.tier.sso,
    };

    if (feature in booleanFeatures) {
      return booleanFeatures[feature];
    }

    // Check features array
    return subscription.tier.features.includes(feature);
  }

  /**
   * Check if user is within their limits
   */
  async checkLimit(
    userId: string,
    resource: 'projects' | 'apiKeys' | 'apiCalls' | 'storage',
    increment: number = 1,
  ): Promise<{ allowed: boolean; current: number; limit: number; message?: string }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!subscription) {
      return { allowed: false, current: 0, limit: 0, message: 'No subscription found' };
    }

    const tier = subscription.tier;
    let current: number;
    let limit: number;

    switch (resource) {
      case 'projects':
        current = await this.prisma.project.count({ where: { ownerId: userId, deletedAt: null } });
        limit = tier.projectLimit;
        break;
      case 'apiKeys':
        current = await this.prisma.apiKeyToken.count({
          where: { userId, revokedAt: null, isActive: true },
        });
        limit = tier.apiKeyLimit;
        break;
      case 'apiCalls':
        current = subscription.currentApiCalls;
        limit = tier.apiCallsPerMonth;
        break;
      case 'storage':
        current = subscription.currentStorage;
        limit = tier.storageLimit;
        break;
    }

    // Unlimited
    if (limit === -1) {
      return { allowed: true, current, limit: -1 };
    }

    const allowed = current + increment <= limit;
    return {
      allowed,
      current,
      limit,
      message: allowed
        ? undefined
        : `${resource} limit reached (${current}/${limit}). Upgrade your plan.`,
    };
  }

  /**
   * Increment API call counter
   */
  async incrementApiCalls(userId: string, count: number = 1): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        currentApiCalls: { increment: count },
      },
    });
  }

  /**
   * Reset usage counters (called at period end)
   */
  async resetUsageCounters(subscriptionId: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentApiCalls: 0,
        currentProjects: 0,
        currentStorage: 0,
      },
    });
  }

  /**
   * Convert to response DTO
   */
  private toSubscriptionResponse(subscription: any): SubscriptionResponseDto {
    const tier = subscription.tier;
    return {
      id: subscription.id,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      tier: {
        id: tier.id,
        name: tier.name,
        displayName: tier.displayName,
        description: tier.description,
        monthlyPrice:
          tier.monthlyPrice instanceof Decimal
            ? tier.monthlyPrice.toNumber()
            : Number(tier.monthlyPrice),
        yearlyPrice:
          tier.yearlyPrice instanceof Decimal
            ? tier.yearlyPrice.toNumber()
            : Number(tier.yearlyPrice),
        currency: tier.currency,
        projectLimit: tier.projectLimit,
        apiKeyLimit: tier.apiKeyLimit,
        apiCallsPerMonth: tier.apiCallsPerMonth,
        syncFrequency: tier.syncFrequency,
        webhookLimit: tier.webhookLimit,
        teamMemberLimit: tier.teamMemberLimit,
        storageLimit: tier.storageLimit,
        aiEnrichment: tier.aiEnrichment,
        customDomain: tier.customDomain,
        prioritySupport: tier.prioritySupport,
        features: tier.features,
        isPopular: tier.isPopular,
      },
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      paymentProvider: subscription.paymentProvider,
      createdAt: subscription.createdAt,
    };
  }
}
