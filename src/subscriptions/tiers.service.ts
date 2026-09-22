import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TierResponseDto } from './dto/subscription.dto';
import { Decimal } from '@prisma/client/runtime/library';

interface TierSeedData {
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  projectLimit: number;
  apiKeyLimit: number;
  apiCallsPerMonth: number;
  syncFrequency: string;
  webhookLimit: number;
  teamMemberLimit: number;
  storageLimit: number;
  aiEnrichment: boolean;
  customDomain: boolean;
  prioritySupport: boolean;
  analytics: boolean;
  exportData: boolean;
  whiteLabel: boolean;
  sso: boolean;
  features: string[];
  isPopular: boolean;
  sortOrder: number;
}

@Injectable()
export class TiersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTiers();
  }

  /**
   * Seed default tiers if they don't exist
   */
  async seedTiers(): Promise<void> {
    const tiersToSeed: TierSeedData[] = [
      {
        name: 'free',
        displayName: 'Free',
        description: 'Perfect for getting started with portfolio showcasing',
        monthlyPrice: 0,
        yearlyPrice: 0,
        projectLimit: 5,
        apiKeyLimit: 1,
        apiCallsPerMonth: 1000,
        syncFrequency: 'daily',
        webhookLimit: 1,
        teamMemberLimit: 0,
        storageLimit: 100,
        aiEnrichment: false,
        customDomain: false,
        prioritySupport: false,
        analytics: false,
        exportData: false,
        whiteLabel: false,
        sso: false,
        features: ['basic_sync', 'public_profile', 'github_integration'],
        isPopular: false,
        sortOrder: 0,
      },
      {
        name: 'pro',
        displayName: 'Pro',
        description: 'For developers who want more power and insights',
        monthlyPrice: 9.99,
        yearlyPrice: 99.99,
        projectLimit: 50,
        apiKeyLimit: 5,
        apiCallsPerMonth: 50000,
        syncFrequency: 'hourly',
        webhookLimit: 10,
        teamMemberLimit: 5,
        storageLimit: 1000,
        aiEnrichment: true,
        customDomain: true,
        prioritySupport: false,
        analytics: true,
        exportData: true,
        whiteLabel: false,
        sso: false,
        features: [
          'basic_sync',
          'public_profile',
          'github_integration',
          'gitlab_integration',
          'bitbucket_integration',
          'ai_analysis',
          'custom_domain',
          'advanced_analytics',
          'export_data',
          'priority_sync',
        ],
        isPopular: true,
        sortOrder: 1,
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        description: 'For teams and organizations with advanced needs',
        monthlyPrice: 49.99,
        yearlyPrice: 499.99,
        projectLimit: -1, // Unlimited
        apiKeyLimit: -1,
        apiCallsPerMonth: -1,
        syncFrequency: 'realtime',
        webhookLimit: -1,
        teamMemberLimit: -1,
        storageLimit: -1,
        aiEnrichment: true,
        customDomain: true,
        prioritySupport: true,
        analytics: true,
        exportData: true,
        whiteLabel: true,
        sso: true,
        features: [
          'basic_sync',
          'public_profile',
          'github_integration',
          'gitlab_integration',
          'bitbucket_integration',
          'ai_analysis',
          'custom_domain',
          'advanced_analytics',
          'export_data',
          'priority_sync',
          'realtime_sync',
          'white_label',
          'sso',
          'priority_support',
          'sla',
          'dedicated_support',
          'custom_integrations',
        ],
        isPopular: false,
        sortOrder: 2,
      },
    ];

    for (const tier of tiersToSeed) {
      await this.prisma.tier.upsert({
        where: { name: tier.name },
        create: tier,
        update: {
          displayName: tier.displayName,
          description: tier.description,
          monthlyPrice: tier.monthlyPrice,
          yearlyPrice: tier.yearlyPrice,
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
          analytics: tier.analytics,
          exportData: tier.exportData,
          whiteLabel: tier.whiteLabel,
          sso: tier.sso,
          features: tier.features,
          isPopular: tier.isPopular,
          sortOrder: tier.sortOrder,
        },
      });
    }
  }

  /**
   * Get all active tiers
   */
  async getAllTiers(): Promise<TierResponseDto[]> {
    const tiers = await this.prisma.tier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return tiers.map(this.toResponseDto);
  }

  /**
   * Get a tier by name
   */
  async getTierByName(name: string): Promise<TierResponseDto | null> {
    const tier = await this.prisma.tier.findUnique({
      where: { name },
    });

    return tier ? this.toResponseDto(tier) : null;
  }

  /**
   * Get a tier by ID
   */
  async getTierById(id: string): Promise<TierResponseDto | null> {
    const tier = await this.prisma.tier.findUnique({
      where: { id },
    });

    return tier ? this.toResponseDto(tier) : null;
  }

  /**
   * Get the free tier ID (for new users)
   */
  async getFreeTierId(): Promise<string> {
    const freeTier = await this.prisma.tier.findUnique({
      where: { name: 'free' },
    });

    if (!freeTier) {
      throw new Error('Free tier not found. Please run tier seed.');
    }

    return freeTier.id;
  }

  /**
   * Convert to response DTO
   */
  private toResponseDto(tier: any): TierResponseDto {
    return {
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
    };
  }
}
