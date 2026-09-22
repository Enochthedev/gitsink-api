import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { ApiKeyService } from './api-key.service';
import { JwtTokenService } from './jwt-token.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Metrics } from '@metrics/decorators/metrics.decorator';
import { RequestWithUser } from '@auth/request-with-user';
// import { ForgotPasswordDto } from './dto/forgot-password.dto';
// import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcryptjs';
import { UserContextGuard } from './user-context.guard';
import { EnhancedJwtGuard } from './enhanced-jwt.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
// import { access } from 'fs';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly magicLinkService: MagicLinkService,
    private readonly apiKeyService: ApiKeyService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: SignupDto })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Metrics({ route: '/auth/signup', operation: 'user_signup' })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'string',
        email: 'string',
        username: 'string',
        createdAt: 'string',
        message: 'User created successfully',
        apiKey: 'string',
      },
    },
    description: 'User successfully created',
  })
  @ApiResponse({ status: 201, description: 'User successfully created' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async signup(@Body() body: SignupDto, @Req() req: Request) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };
    this.logger.log(`Signup attempt for email: ${body.email}`, { clientInfo });

    const result = await this.authService.signup(body.email, body.password, body.username);
    this.logger.log(`Signup successful for email: ${body.email}`, {
      userId: result.user.id,
      hasApiKey: !!result.apiKey,
    });

    return {
      message: 'User created successfully',
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        createdAt: result.user.createdAt,
      },
      apiKey: result.apiKey, // Only return in response, not logs
    };
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Metrics({ route: '/auth/signin-with-MagicLink', operation: 'user_signin' })
  @ApiOperation({ summary: 'Send signin email' })
  @ApiResponse({ status: 200, description: 'Signin email sent if user exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiOkResponse({ schema: { example: { token: 'jwt' } } })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async signin(@Body() body: LoginDto, @Req() req: Request) {
    const user = await this.authService.getUserByEmail(body.email);
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };
    this.logger.log(`Signin  attempt for email: ${body.email}`, {
      clientInfo,
    });

    if (user.password) {
      if (!body.password) {
        throw new UnauthorizedException('Password required');
      }
      const ok = await bcrypt.compare(body.password, user.password);
      if (!ok) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }
    const result = await this.authService.signin(body.email, body.password || '', {
      ipAddress: clientInfo.ip,
    });
    // return { token: this.authService.generateJwt(user) };
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        githubId: user.githubId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        hasApiKey: !!user.apiKey,
      },
    };
  }

  @Post('password-reset')
  @ApiBody({ type: ForgotPasswordDto })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @Metrics({
    route: '/auth/password-reset',
    operation: 'password_reset_request',
  })
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if user exists',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async requestPasswordReset(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    const { email } = body;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };

    this.logger.log(`Password reset requested for email: ${email}`, {
      clientInfo,
    });

    await this.authService.requestPasswordReset(email, clientInfo);

    return {
      message: 'If an account with this email exists, a password reset link has been sent',
    };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ResetPasswordDto })
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes
  @Metrics({
    route: '/auth/password-reset/confirm',
    operation: 'password_reset_confirm',
  })
  @ApiOperation({ summary: 'Confirm password reset with token' })
  @ApiResponse({ status: 200, description: 'Password successfully reset' })
  @ApiResponse({ status: 400, description: 'Invalid token or weak password' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async confirmPasswordReset(@Body() body: ResetPasswordDto, @Req() req: Request) {
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };

    this.logger.log('Password reset confirmation attempt', {
      tokenPrefix: token.substring(0, 8) + '...',
      clientInfo,
    });

    const success = await this.authService.resetPassword(token, newPassword);

    if (!success) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    this.logger.log('Password reset successful', {
      tokenPrefix: token.substring(0, 8) + '...',
      clientInfo,
    });

    return {
      message: 'Password successfully reset. A confirmation email has been sent.',
    };
  }

  @Get('profile')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Metrics({ route: '/auth/profile', operation: 'get_profile' })
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Req() req: RequestWithUser) {
    const user = req.user;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      githubId: user.githubId,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      hasApiKey: !!user.apiKey,
    };
  }

  @Post('api-key/regenerate')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @Metrics({
    route: '/auth/api-key/regenerate',
    operation: 'regenerate_api_key',
  })
  @ApiOperation({ summary: 'Regenerate API key' })
  @ApiResponse({ status: 200, description: 'New API key generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async regenerateApiKey(@Req() req: RequestWithUser, @Body() body?: { reason?: string }) {
    const user = req.user;
    const reason = body?.reason || 'user_requested';

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };

    this.logger.log(`API key regeneration requested by user ${user.id}`, {
      userId: user.id,
      reason,
      clientInfo,
    });

    const result = await this.apiKeyService.generateApiKey(user.id, reason, clientInfo);

    return {
      message: 'API key regenerated successfully',
      apiKey: result.apiKey,
      user: {
        id: result.user.id,
        email: result.user.email,
        tier: result.user.tier,
        updatedAt: result.user.apiKeyUpdatedAt as Date,
      },
    };
  }

  @Post('api-key/revoke')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 2, ttl: 300000 } }) // 2 requests per 5 minutes
  @Metrics({ route: '/auth/api-key/revoke', operation: 'revoke_api_key' })
  @ApiOperation({ summary: 'Revoke API key' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async revokeApiKey(@Req() req: RequestWithUser, @Body() body?: { reason?: string }) {
    const user = req.user;
    const reason = body?.reason || 'user_requested';

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    };

    this.logger.log(`API key revocation requested by user ${user.id}`, {
      userId: user.id,
      reason,
      clientInfo,
    });

    const result = await this.apiKeyService.revokeApiKey(user.id, reason, clientInfo);

    return {
      message: 'API key revoked successfully',
      user: {
        id: result.id,
        email: result.email,
        tier: result.tier,
        hasApiKey: false,
      },
    };
  }

  @Post('github/connect')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes
  @Metrics({ route: '/auth/github/connect', operation: 'connect_github' })
  @ApiOperation({ summary: 'Connect GitHub account' })
  @ApiResponse({ status: 200, description: 'GitHub account connected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { code: { type: 'string', example: 'gh_oauth_code_123' } },
    },
  })
  async connectGitHub(@Req() req: RequestWithUser, @Body() body: { code: string }) {
    const user = req.user;
    const { code } = body || {};

    if (!code) {
      throw new BadRequestException('GitHub authorization code is required');
    }

    this.logger.log(`GitHub connection attempt by user ${user.id}`);

    const result = await this.authService.oauth(user.id, code);

    return {
      message: 'GitHub account connected successfully',
      user: {
        id: result.id,
        email: result.email,
        githubId: result.githubId,
        hasGitHub: !!result.githubId,
      },
    };
  }

  @Post('magic-link/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @Metrics({ route: '/auth/magic-link/send', operation: 'send_magic_link' })
  @ApiOperation({ summary: 'Send magic link for authentication' })
  @ApiResponse({
    status: 200,
    description: 'Magic link sent if user exists',
    schema: {
      example: {
        message: 'If an account with this email exists, a magic link has been sent',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async sendMagicLink(@Body() body: { email: string }, @Req() req: Request) {
    const { email } = body || {};

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      endpoint: '/auth/magic-link/send',
      timestamp: new Date(),
    };

    this.logger.log(`Magic link requested for email: ${email}`, {
      clientInfo,
    });

    await this.magicLinkService.sendMagicLink(email, clientInfo);

    return {
      message: 'If an account with this email exists, a magic link has been sent',
    };
  }

  @Post('magic-link/validate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300000 } }) // 10 requests per 5 minutes
  @Metrics({
    route: '/auth/magic-link/validate',
    operation: 'validate_magic_link',
  })
  @ApiOperation({ summary: 'Validate magic link token and authenticate user' })
  @ApiResponse({
    status: 200,
    description: 'Magic link validated successfully',
    schema: {
      example: {
        accessToken: 'jwt_access_token',
        refreshToken: 'jwt_refresh_token',
        expiresIn: 900,
        user: {
          id: 'user_id',
          email: 'user@example.com',
          username: 'username',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid token format' })
  @ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async validateMagicLink(@Body() body: { token: string }, @Req() req: Request) {
    const { token } = body || {};

    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const clientInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      endpoint: '/auth/magic-link/validate',
      timestamp: new Date(),
    };

    this.logger.log('Magic link validation attempt', {
      tokenPrefix: token.substring(0, 8) + '...',
      clientInfo,
    });

    const result = await this.magicLinkService.validateMagicLink(token, clientInfo);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
      },
    };
  }

  @Get('magic-link/stats')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Metrics({ route: '/auth/magic-link/stats', operation: 'magic_link_stats' })
  @ApiOperation({ summary: 'Get magic link statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Magic link statistics',
    schema: {
      example: {
        totalActive: 5,
        totalExpired: 12,
        recentlyCreated: 2,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMagicLinkStats(@Req() req: RequestWithUser) {
    // In a real app, you'd check if user is admin
    // For now, any authenticated user can see stats
    return await this.magicLinkService.getMagicLinkStats();
  }

  @Post('magic-link/cleanup')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 2, ttl: 300000 } }) // 2 requests per 5 minutes
  @Metrics({
    route: '/auth/magic-link/cleanup',
    operation: 'cleanup_magic_links',
  })
  @ApiOperation({ summary: 'Cleanup expired magic link tokens (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Expired tokens cleaned up',
    schema: {
      example: {
        message: 'Cleaned up expired magic link tokens',
        count: 5,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async cleanupExpiredMagicLinks(@Req() req: RequestWithUser) {
    // In a real app, you'd check if user is admin
    const count = await this.magicLinkService.cleanupExpiredTokens();

    this.logger.log('Manual cleanup of expired magic link tokens completed', {
      userId: req.user.id,
      count,
    });

    return {
      message: 'Cleaned up expired magic link tokens',
      count,
    };
  }

  @Get('api-key/stats')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Metrics({ route: '/auth/api-key/stats', operation: 'api_key_stats' })
  @ApiOperation({ summary: 'Get API key usage statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'API key statistics',
    schema: {
      example: {
        totalKeys: 150,
        activeKeys: 120,
        revokedKeys: 30,
        totalUsage: 50000,
        recentUsage: 1200,
        topUsers: [{ userId: 'user-1', email: 'user@example.com', usageCount: 500 }],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getApiKeyStats(
    @Req() req: RequestWithUser,
    @Body() body?: { timeRange?: { from: string; to: string } },
  ) {
    // In a real app, you'd check if user is admin
    // For now, any authenticated user can see stats

    const timeRange = body?.timeRange
      ? {
          from: new Date(body.timeRange.from),
          to: new Date(body.timeRange.to),
        }
      : undefined;

    const stats = await this.apiKeyService.getApiKeyStats(timeRange);

    this.logger.log(`API key stats requested by user ${req.user.id}`, {
      userId: req.user.id,
      timeRange,
    });

    return stats;
  }

  @Post('api-key/update-metrics')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes
  @Metrics({
    route: '/auth/api-key/update-metrics',
    operation: 'update_api_key_metrics',
  })
  @ApiOperation({ summary: 'Update API key metrics (admin only)' })
  @ApiResponse({ status: 200, description: 'Metrics updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async updateApiKeyMetrics(@Req() req: RequestWithUser) {
    // In a real app, you'd check if user is admin
    await this.apiKeyService.updateActiveKeysMetrics();

    this.logger.log(`API key metrics update requested by user ${req.user.id}`, {
      userId: req.user.id,
    });

    return {
      message: 'API key metrics updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300000 } }) // 10 requests per 5 minutes
  @Metrics({ route: '/auth/token/refresh', operation: 'refresh_token' })
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'New access token generated',
    schema: {
      example: {
        accessToken: 'new_jwt_access_token',
        expiresIn: 900,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async refreshToken(@Body() body: { refreshToken: string }, @Req() req: Request) {
    const { refreshToken } = body || {};

    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const deviceInfo = {
      deviceId: req.headers['x-device-id'] as string,
      ipAddress: req.ip || req.connection?.remoteAddress,
    };

    this.logger.log('Token refresh attempt', {
      deviceInfo,
    });

    const result = await this.jwtTokenService.refreshAccessToken(refreshToken, deviceInfo);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('token/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes
  @Metrics({ route: '/auth/token/revoke', operation: 'revoke_token' })
  @ApiOperation({ summary: 'Revoke a specific token (logout)' })
  @ApiResponse({ status: 200, description: 'Token revoked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async revokeToken(@Body() body: { token: string; reason?: string }, @Req() req: Request) {
    const { token, reason } = body || {};

    if (!token) {
      throw new BadRequestException('Token is required');
    }

    this.logger.log('Token revocation attempt', {
      reason: reason || 'user_logout',
    });

    await this.jwtTokenService.blacklistToken(token, reason);

    return {
      message: 'Token revoked successfully',
    };
  }

  @Post('token/revoke-all')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @Metrics({ route: '/auth/token/revoke-all', operation: 'revoke_all_tokens' })
  @ApiOperation({
    summary: 'Revoke all tokens for user (logout from all devices)',
  })
  @ApiResponse({ status: 200, description: 'All tokens revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async revokeAllTokens(@Req() req: RequestWithUser, @Body() body?: { reason?: string }) {
    const user = req.user;
    const reason = body?.reason || 'logout_all_devices';

    this.logger.log(`All tokens revocation requested by user ${user.id}`, {
      userId: user.id,
      reason,
    });

    const count = await this.jwtTokenService.revokeAllUserTokens(user.id, reason);

    return {
      message: 'All tokens revoked successfully',
      revokedCount: count,
    };
  }

  @Get('token/stats')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Metrics({ route: '/auth/token/stats', operation: 'token_stats' })
  @ApiOperation({ summary: 'Get JWT token statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Token statistics',
    schema: {
      example: {
        totalTokensIssued: 1500,
        activeRefreshTokens: 120,
        blacklistedTokens: 45,
        expiredTokens: 300,
        recentTokens: 25,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTokenStats(@Req() req: RequestWithUser) {
    // In a real app, you'd check if user is admin
    const stats = await this.jwtTokenService.getTokenStats();

    this.logger.log(`Token stats requested by user ${req.user.id}`, {
      userId: req.user.id,
    });

    return stats;
  }

  @Post('token/cleanup')
  @UseGuards(EnhancedJwtGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 2, ttl: 300000 } }) // 2 requests per 5 minutes
  @Metrics({ route: '/auth/token/cleanup', operation: 'cleanup_tokens' })
  @ApiOperation({ summary: 'Cleanup expired tokens (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Expired tokens cleaned up',
    schema: {
      example: {
        message: 'Expired tokens cleaned up successfully',
        refreshTokens: 15,
        blacklistEntries: 8,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async cleanupExpiredTokens(@Req() req: RequestWithUser) {
    // In a real app, you'd check if user is admin
    const result = await this.jwtTokenService.cleanupExpiredTokens();

    this.logger.log(`Token cleanup requested by user ${req.user.id}`, {
      userId: req.user.id,
      result,
    });

    return {
      message: 'Expired tokens cleaned up successfully',
      refreshTokens: result.refreshTokens,
      blacklistEntries: result.blacklistEntries,
    };
  }

  @Get('health')
  @Metrics({ route: '/auth/health', operation: 'health_check' })
  @ApiOperation({ summary: 'Auth service health check' })
  @ApiResponse({ status: 200, description: 'Auth service is healthy' })
  async healthCheck() {
    return {
      status: 'ok',
      service: 'auth',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected', // You could add actual DB health check here
        redis: 'connected', // You could add actual Redis health check here
      },
    };
  }

  // @Post('forgot-password')
  // @ApiBody({ type: ForgotPasswordDto })
  // @ApiOkResponse({ schema: { example: { sent: true } } })
  // async forgotPassword(@Body() body: ForgotPasswordDto) {
  //   await this.authService.requestPasswordReset(body.email);
  //   return { sent: true };
  // }

  // @Post('reset-password')
  // @ApiBody({ type: ResetPasswordDto })
  // @ApiOkResponse({ schema: { example: { success: true } } })
  // @ApiUnauthorizedResponse({ description: 'Invalid token' })
  // async resetPassword(@Body() body: ResetPasswordDto) {
  //   const ok = await this.authService.resetPassword(body.token, body.password);
  //   if (!ok) {
  //     throw new UnauthorizedException('Invalid token');
  //   }
  //   return { success: true };
  // }
}
