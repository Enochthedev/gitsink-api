import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'test',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'test',
      callbackURL: config.get<string>('GITHUB_CALLBACK_URL') || '/auth/github/callback',
      scope: ['repo', 'user:email'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email = Array.isArray(profile.emails) && profile.emails.length > 0 ? profile.emails[0].value : undefined;
    return { accessToken, githubId: profile.id, email };
  }
}
