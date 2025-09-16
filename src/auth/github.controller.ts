import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';

interface GitHubUser {
  accessToken: string;
  refreshToken?: string;
  githubId: string;
  email?: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
}

@ApiTags('auth')
@Controller('auth')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtTokenService: JwtTokenService,
  ) { }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirect to GitHub OAuth' })
  githubLogin() {
    // This method is handled by Passport
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Handle GitHub OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'OAuth successful, returns JWT tokens',
  })
  @ApiResponse({ status: 400, description: 'Invalid OAuth response' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const githubUser = req.user as GitHubUser;

      if (!githubUser) {
        this.logger.error('GitHub OAuth callback missing user data');
        throw new BadRequestException('GitHub authentication failed');
      }

      const { accessToken, refreshToken, githubId, email, username, displayName, avatarUrl } =
        githubUser;

      // Validate required fields
      if (!githubId || !accessToken) {
        this.logger.error('GitHub OAuth missing required fields', {
          hasGithubId: !!githubId,
          hasAccessToken: !!accessToken,
        });
        throw new BadRequestException('Invalid GitHub OAuth response');
      }

      this.logger.log('Processing GitHub OAuth callback', {
        githubId,
        email,
        username,
        hasRefreshToken: !!refreshToken,
      });

      // Fixed: Enhanced user creation/update with comprehensive token handling
      const user = await this.authService.findOrCreateWithGitHub(githubId, accessToken, email);

      // Update user profile with additional GitHub data if available
      if (username || displayName || avatarUrl) {
        try {
          await this.authService.updateUserProfile(user.id, {
            username: username ?? user.username ?? undefined,
            displayName,
            avatarUrl,
          });
        } catch (profileError) {
          this.logger.warn('Failed to update user profile during GitHub OAuth', {
            error: profileError instanceof Error ? profileError.message : String(profileError),
            userId: user.id,
          });
          // Don't fail OAuth if profile update fails
        }
      }

      // Generate JWT token pair with device tracking
      const deviceInfo = {
        deviceId: (req.headers['x-device-id'] as string) || `github-oauth-${Date.now()}`,
        ipAddress: req.ip || req.connection?.remoteAddress,
      };

      const tokenPair = await this.jwtTokenService.generateTokenPair(user, deviceInfo);

      // Store GitHub tokens for future API calls
      try {
        // Store access token in user record
        await this.authService.connectGitHub(user.id, githubId, accessToken);

        // Store refresh token if available (GitHub doesn't provide refresh tokens currently)
        if (refreshToken) {
          await this.authService.storeGitHubRefreshToken(user.id, refreshToken);
        }
      } catch (tokenError) {
        this.logger.warn('Failed to store GitHub tokens during OAuth', {
          error: tokenError instanceof Error ? tokenError.message : String(tokenError),
          userId: user.id,
          hasRefreshToken: !!refreshToken,
        });
        // Don't fail OAuth if token storage fails
      }

      this.logger.log('GitHub OAuth successful', {
        userId: user.id,
        githubId,
        email: user.email,
      });

      // Return tokens in response
      return res.json({
        message: 'GitHub authentication successful',
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          githubId: user.githubId,
          hasApiKey: !!user.apiKey,
        },
      });
    } catch (error) {
      this.logger.error('GitHub OAuth callback error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('GitHub authentication failed');
    }
  }
}
