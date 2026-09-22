import { Controller, Get, HttpStatus, Logger, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PlatformRegistryService } from '../services/platform-registry.service';

@Controller('auth/gitlab')
export class GitLabOAuthController {
  private readonly logger = new Logger(GitLabOAuthController.name);

  constructor(
    private readonly platformRegistry: PlatformRegistryService,
    private readonly config: ConfigService,
  ) {}

  @Get('authorize')
  async authorize(@Res() res: Response) {
    try {
      const provider = this.platformRegistry.getProvider('gitlab');
      if (!provider) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'GitLab provider not available',
        });
      }

      const clientId = this.config.get<string>('GITLAB_CLIENT_ID');
      const redirectUri = this.config.get<string>('GITLAB_REDIRECT_URI');
      const scopes = ['read_user', 'read_repository', 'write_repository'];
      const state = this.generateState();

      if (!clientId || !redirectUri) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'GitLab OAuth configuration missing',
        });
      }

      const authUrl = provider.getAuthorizationUrl(clientId, redirectUri, scopes, state);

      // Store state in session or cache for validation
      // For now, we'll just redirect
      return res.redirect(authUrl);
    } catch (error) {
      this.logger.error('GitLab authorization failed:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Authorization failed',
        message:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      });
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    try {
      if (error) {
        this.logger.error(`GitLab OAuth error: ${error}`);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'OAuth authorization failed',
          details: error,
        });
      }

      if (!code) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Authorization code missing',
        });
      }

      // TODO: Validate state parameter

      const provider = this.platformRegistry.getProvider('gitlab');
      if (!provider) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'GitLab provider not available',
        });
      }

      const clientId = this.config.get<string>('GITLAB_CLIENT_ID');
      const clientSecret = this.config.get<string>('GITLAB_CLIENT_SECRET');
      const redirectUri = this.config.get<string>('GITLAB_REDIRECT_URI');

      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'GitLab OAuth configuration missing',
        });
      }

      // Exchange code for token
      const credentials = await provider.exchangeCodeForToken(
        clientId,
        clientSecret,
        code,
        redirectUri,
      );

      // Authenticate with GitLab to get user info
      const authResult = await provider.authenticate(credentials);

      if (!authResult.success) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: 'GitLab authentication failed',
          details: authResult.error,
        });
      }

      // TODO: Store credentials and user info in database
      // TODO: Create or update PlatformConnection record
      // TODO: Generate JWT token for the user

      return res.json({
        success: true,
        user: authResult.user,
        platform: 'gitlab',
        // Don't return the actual tokens in the response
        tokenReceived: !!credentials.accessToken,
      });
    } catch (error) {
      this.logger.error('GitLab OAuth callback failed:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      });
    }
  }

  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }
}
