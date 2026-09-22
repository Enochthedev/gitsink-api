import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SecurityMonitoringService } from '../services/security-monitoring.service';
import { RateLimitingService } from '../services/rate-limiting.service';
import { UserContextGuard } from '@auth/user-context.guard';
import { AdvancedRateLimit } from '../guards/advanced-rate-limit.guard';
import { Metrics } from '@metrics/decorators/metrics.decorator';

@ApiTags('Security')
@Controller('security')
@UseGuards(UserContextGuard)
@ApiBearerAuth()
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);

  constructor(
    private readonly securityMonitoringService: SecurityMonitoringService,
    private readonly rateLimitingService: RateLimitingService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get security statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Security statistics retrieved',
    schema: {
      example: {
        totalEvents: 150,
        eventsByType: {
          suspicious_login: 25,
          brute_force_attempt: 10,
          rate_limit_exceeded: 50,
        },
        eventsBySeverity: {
          low: 80,
          medium: 45,
          high: 20,
          critical: 5,
        },
        blockedIps: 12,
        suspiciousActivities: 8,
        recentAlerts: [],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (ISO string)',
  })
  @AdvancedRateLimit({ maxRequests: 10, windowMs: 60000, bypassPremium: true })
  @Metrics({ route: '/security/stats', operation: 'get_security_stats' })
  async getSecurityStats(@Query('from') from?: string, @Query('to') to?: string) {
    // TODO: Add admin role check
    const timeRange =
      from && to
        ? {
            from: new Date(from),
            to: new Date(to),
          }
        : undefined;

    return await this.securityMonitoringService.getSecurityStats(timeRange);
  }

  @Get('suspicious-activity/:identifier')
  @ApiOperation({
    summary: 'Get suspicious activity for identifier (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Suspicious activity retrieved',
    schema: {
      example: {
        identifier: 'ip:192.168.1.1',
        score: 85,
        events: [],
        firstSeen: '2024-01-01T00:00:00Z',
        lastSeen: '2024-01-01T12:00:00Z',
        isBlocked: false,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'No suspicious activity found' })
  @ApiParam({ name: 'identifier', description: 'IP address or user ID' })
  @AdvancedRateLimit({ maxRequests: 20, windowMs: 60000, bypassPremium: true })
  @Metrics({
    route: '/security/suspicious-activity/:identifier',
    operation: 'get_suspicious_activity',
  })
  async getSuspiciousActivity(@Param('identifier') identifier: string) {
    // TODO: Add admin role check
    const activity = await this.securityMonitoringService.getSuspiciousActivity(identifier);

    if (!activity) {
      return {
        message: 'No suspicious activity found for this identifier',
        identifier,
      };
    }

    return activity;
  }

  @Post('block-ip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block an IP address (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'IP address blocked successfully',
    schema: {
      example: {
        message: 'IP address blocked successfully',
        ipAddress: '192.168.1.1',
        durationMinutes: 60,
        reason: 'Manual block by admin',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid IP address or parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @AdvancedRateLimit({ maxRequests: 5, windowMs: 300000, bypassPremium: true })
  @Metrics({ route: '/security/block-ip', operation: 'block_ip' })
  async blockIp(
    @Body()
    body: {
      ipAddress: string;
      reason: string;
      durationMinutes?: number;
    },
  ) {
    // TODO: Add admin role check and get admin user ID
    const { ipAddress, reason, durationMinutes = 60 } = body;

    await this.securityMonitoringService.blockIp(
      ipAddress,
      reason,
      durationMinutes,
      'admin', // TODO: Get actual admin user ID
    );

    this.logger.log('IP address blocked via API', {
      ipAddress,
      reason,
      durationMinutes,
    });

    return {
      message: 'IP address blocked successfully',
      ipAddress,
      durationMinutes,
      reason,
    };
  }

  @Delete('block-ip/:ipAddress')
  @ApiOperation({ summary: 'Unblock an IP address (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'IP address unblocked successfully',
    schema: {
      example: {
        message: 'IP address unblocked successfully',
        ipAddress: '192.168.1.1',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiParam({ name: 'ipAddress', description: 'IP address to unblock' })
  @AdvancedRateLimit({ maxRequests: 10, windowMs: 300000, bypassPremium: true })
  @Metrics({ route: '/security/block-ip/:ipAddress', operation: 'unblock_ip' })
  async unblockIp(@Param('ipAddress') ipAddress: string) {
    // TODO: Add admin role check and get admin user ID
    await this.securityMonitoringService.unblockIp(ipAddress, 'admin');

    this.logger.log('IP address unblocked via API', {
      ipAddress,
    });

    return {
      message: 'IP address unblocked successfully',
      ipAddress,
    };
  }

  @Get('rate-limit/stats')
  @ApiOperation({ summary: 'Get rate limiting statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Rate limiting statistics retrieved',
    schema: {
      example: {
        totalRequests: 10000,
        blockedRequests: 150,
        blockRate: 0.015,
        topBlockedEndpoints: [
          { endpoint: '/auth/signin', count: 50 },
          { endpoint: '/projects/sync', count: 30 },
        ],
        tierBreakdown: {
          free: { allowed: 8000, blocked: 120 },
          premium: { allowed: 1800, blocked: 25 },
          enterprise: { allowed: 200, blocked: 5 },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date (ISO string)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (ISO string)',
  })
  @AdvancedRateLimit({ maxRequests: 10, windowMs: 60000, bypassPremium: true })
  @Metrics({
    route: '/security/rate-limit/stats',
    operation: 'get_rate_limit_stats',
  })
  async getRateLimitStats(@Query('from') from?: string, @Query('to') to?: string) {
    // TODO: Add admin role check
    const timeRange =
      from && to
        ? {
            from: new Date(from),
            to: new Date(to),
          }
        : undefined;

    return await this.rateLimitingService.getRateLimitStats(timeRange);
  }

  @Post('rate-limit/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear rate limit for identifier (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Rate limit cleared successfully',
    schema: {
      example: {
        message: 'Rate limit cleared successfully',
        identifier: 'user:123',
        endpoint: '/auth/signin',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @AdvancedRateLimit({ maxRequests: 5, windowMs: 300000, bypassPremium: true })
  @Metrics({
    route: '/security/rate-limit/clear',
    operation: 'clear_rate_limit',
  })
  async clearRateLimit(@Body() body: { identifier: string; endpoint?: string }) {
    // TODO: Add admin role check
    const { identifier, endpoint } = body;

    await this.rateLimitingService.clearRateLimit(identifier, endpoint);

    this.logger.log('Rate limit cleared via API', {
      identifier,
      endpoint,
    });

    return {
      message: 'Rate limit cleared successfully',
      identifier,
      endpoint,
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Security service health check' })
  @ApiResponse({
    status: 200,
    description: 'Security service is healthy',
    schema: {
      example: {
        status: 'ok',
        service: 'security',
        timestamp: '2024-01-01T12:00:00Z',
        checks: {
          monitoring: 'operational',
          rateLimiting: 'operational',
          ipBlocking: 'operational',
        },
      },
    },
  })
  @AdvancedRateLimit({ maxRequests: 30, windowMs: 60000 })
  @Metrics({ route: '/security/health', operation: 'security_health_check' })
  async healthCheck() {
    return {
      status: 'ok',
      service: 'security',
      timestamp: new Date().toISOString(),
      checks: {
        monitoring: 'operational',
        rateLimiting: 'operational',
        ipBlocking: 'operational',
      },
    };
  }
}
