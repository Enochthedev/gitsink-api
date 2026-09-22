import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { TiersService } from './tiers.service';
import { SubscriptionsService } from './subscriptions.service';
import {
  CancelSubscriptionDto,
  SubscriptionResponseDto,
  TierResponseDto,
  UpgradeTierDto,
  UsageResponseDto,
} from './dto/subscription.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

@ApiTags('Subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(
    private readonly tiersService: TiersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // ============ PUBLIC TIER ENDPOINTS ============

  @Get('tiers')
  @ApiOperation({
    summary: 'List all available tiers',
    description: 'Get all subscription tiers with pricing and features',
  })
  @ApiResponse({ status: 200, description: 'List of tiers', type: [TierResponseDto] })
  async listTiers(): Promise<TierResponseDto[]> {
    return this.tiersService.getAllTiers();
  }

  @Get('tiers/:name')
  @ApiOperation({ summary: 'Get tier details', description: 'Get details for a specific tier' })
  @ApiParam({ name: 'name', description: 'Tier name (free, pro, enterprise)' })
  @ApiResponse({ status: 200, description: 'Tier details', type: TierResponseDto })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async getTier(@Param('name') name: string): Promise<TierResponseDto> {
    const tier = await this.tiersService.getTierByName(name);
    if (!tier) {
      throw new Error('Tier not found');
    }
    return tier;
  }

  // ============ AUTHENTICATED SUBSCRIPTION ENDPOINTS ============

  @Get('subscriptions/current')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current subscription',
    description: "Get the authenticated user's current subscription",
  })
  @ApiResponse({ status: 200, description: 'Current subscription', type: SubscriptionResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentSubscription(
    @Req() req: RequestWithUser,
  ): Promise<SubscriptionResponseDto | null> {
    return this.subscriptionsService.getCurrentSubscription(req.user.id);
  }

  @Get('subscriptions/usage')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get usage statistics',
    description: 'Get current usage vs limits for the billing period',
  })
  @ApiResponse({ status: 200, description: 'Usage statistics', type: UsageResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUsage(@Req() req: RequestWithUser): Promise<UsageResponseDto> {
    return this.subscriptionsService.getUsage(req.user.id);
  }

  @Post('subscriptions/upgrade')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upgrade subscription tier',
    description: 'Upgrade to a new subscription tier',
  })
  @ApiResponse({ status: 200, description: 'Upgrade initiated' })
  @ApiResponse({ status: 400, description: 'Invalid tier or already on tier' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upgradeTier(@Req() req: RequestWithUser, @Body() dto: UpgradeTierDto) {
    return this.subscriptionsService.upgradeTier(req.user.id, dto);
  }

  @Post('subscriptions/cancel')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription', description: 'Cancel the current subscription' })
  @ApiResponse({ status: 200, description: 'Subscription canceled', type: SubscriptionResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot cancel free subscription' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cancelSubscription(
    @Req() req: RequestWithUser,
    @Body() dto: CancelSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.cancelSubscription(req.user.id, dto.reason, dto.immediate);
  }

  @Post('subscriptions/resume')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resume subscription',
    description: 'Resume a canceled subscription before period end',
  })
  @ApiResponse({ status: 200, description: 'Subscription resumed', type: SubscriptionResponseDto })
  @ApiResponse({ status: 400, description: 'Subscription not set to cancel' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resumeSubscription(@Req() req: RequestWithUser): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.resumeSubscription(req.user.id);
  }

  @Get('subscriptions/features/:feature')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check feature access',
    description: 'Check if user has access to a specific feature',
  })
  @ApiParam({ name: 'feature', description: 'Feature name to check' })
  @ApiResponse({ status: 200, description: 'Feature access status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async hasFeature(
    @Req() req: RequestWithUser,
    @Param('feature') feature: string,
  ): Promise<{ hasAccess: boolean; feature: string }> {
    const hasAccess = await this.subscriptionsService.hasFeature(req.user.id, feature);
    return { hasAccess, feature };
  }
}
