import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);

  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'test',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'test',
      callbackURL: config.get<string>('GITHUB_CALLBACK_URL') || '/auth/github/callback',
      scope: ['repo', 'user:email'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email =
      Array.isArray(profile.emails) && profile.emails.length > 0
        ? profile.emails[0].value
        : undefined;

    // Fixed: Enhanced validation with better error handling and logging
    this.logger.log('GitHub OAuth validation', {
      githubId: profile.id,
      username: profile.username,
      hasEmail: !!email,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    });

    // Validate required fields
    if (!profile.id) {
      this.logger.error('GitHub profile missing ID', { profile });
      throw new Error('GitHub profile missing required ID');
    }

    if (!accessToken) {
      this.logger.error('GitHub OAuth missing access token');
      throw new Error('GitHub OAuth missing access token');
    }

    return {
      accessToken,
      refreshToken, // GitHub doesn't provide refresh tokens, but we store it if available
      githubId: profile.id,
      email,
      username: profile.username,
      displayName: profile.displayName,
      profileUrl: profile.profileUrl,
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
