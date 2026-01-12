import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum BillingCycle {
    MONTHLY = 'monthly',
    YEARLY = 'yearly',
}

export enum SubscriptionStatus {
    ACTIVE = 'active',
    CANCELED = 'canceled',
    PAST_DUE = 'past_due',
    TRIALING = 'trialing',
    PAUSED = 'paused',
}

export enum PaymentProvider {
    STRIPE = 'stripe',
    PAYPAL = 'paypal',
    LEMONSQUEEZY = 'lemonsqueezy',
}

// ============ Tier DTOs ============

export class TierResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
    id!: string;

    @ApiProperty({ example: 'pro' })
    name!: string;

    @ApiProperty({ example: 'Pro Plan' })
    displayName!: string;

    @ApiPropertyOptional({ example: 'Unlock more projects and API calls' })
    description?: string;

    @ApiProperty({ example: 19.99 })
    monthlyPrice!: number;

    @ApiProperty({ example: 199.99 })
    yearlyPrice!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ example: 50 })
    projectLimit!: number;

    @ApiProperty({ example: 5 })
    apiKeyLimit!: number;

    @ApiProperty({ example: 50000 })
    apiCallsPerMonth!: number;

    @ApiProperty({ example: 'hourly' })
    syncFrequency!: string;

    @ApiProperty({ example: 10 })
    webhookLimit!: number;

    @ApiProperty({ example: 5 })
    teamMemberLimit!: number;

    @ApiProperty({ example: 1000 })
    storageLimit!: number;

    @ApiProperty({ example: true })
    aiEnrichment!: boolean;

    @ApiProperty({ example: true })
    customDomain!: boolean;

    @ApiProperty({ example: false })
    prioritySupport!: boolean;

    @ApiProperty({ example: ['advanced_analytics', 'custom_reports'] })
    features!: string[];

    @ApiProperty({ example: true })
    isPopular!: boolean;
}

export class TierListResponseDto {
    @ApiProperty({ type: [TierResponseDto] })
    tiers!: TierResponseDto[];
}

// ============ Subscription DTOs ============

export class SubscriptionResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
    id!: string;

    @ApiProperty({ example: 'active', enum: SubscriptionStatus })
    status!: string;

    @ApiProperty({ example: 'monthly', enum: BillingCycle })
    billingCycle!: string;

    @ApiProperty({ type: TierResponseDto })
    tier!: TierResponseDto;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    currentPeriodStart!: Date;

    @ApiProperty({ example: '2024-02-01T00:00:00.000Z' })
    currentPeriodEnd!: Date;

    @ApiPropertyOptional({ example: '2024-01-15T00:00:00.000Z' })
    trialEnd?: Date;

    @ApiProperty({ example: false })
    cancelAtPeriodEnd!: boolean;

    @ApiPropertyOptional({ example: 'stripe' })
    paymentProvider?: string;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    createdAt!: Date;
}

export class UpgradeTierDto {
    @ApiProperty({ example: 'pro', description: 'Name of the tier to upgrade to' })
    @IsString()
    tierName!: string;

    @ApiPropertyOptional({ example: 'monthly', enum: BillingCycle })
    @IsOptional()
    @IsEnum(BillingCycle)
    billingCycle?: BillingCycle;

    @ApiPropertyOptional({ example: 'stripe', enum: PaymentProvider })
    @IsOptional()
    @IsEnum(PaymentProvider)
    paymentProvider?: PaymentProvider;
}

export class CancelSubscriptionDto {
    @ApiPropertyOptional({ example: 'Too expensive' })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional({
        example: true,
        description: 'Cancel immediately or at period end',
    })
    @IsOptional()
    immediate?: boolean;
}

export class UsageResponseDto {
    @ApiProperty({ example: 3500 })
    apiCallsUsed!: number;

    @ApiProperty({ example: 50000 })
    apiCallsLimit!: number;

    @ApiProperty({ example: 7 })
    apiCallsPercentage!: number;

    @ApiProperty({ example: 12 })
    projectsUsed!: number;

    @ApiProperty({ example: 50 })
    projectsLimit!: number;

    @ApiProperty({ example: 24 })
    projectsPercentage!: number;

    @ApiProperty({ example: 2 })
    apiKeysUsed!: number;

    @ApiProperty({ example: 5 })
    apiKeysLimit!: number;

    @ApiProperty({ example: 40 })
    apiKeysPercentage!: number;

    @ApiProperty({ example: 45 })
    storageUsed!: number;

    @ApiProperty({ example: 1000 })
    storageLimit!: number;

    @ApiProperty({ example: 4.5 })
    storagePercentage!: number;

    @ApiProperty({ example: '2024-02-01T00:00:00.000Z' })
    resetDate!: Date;
}
