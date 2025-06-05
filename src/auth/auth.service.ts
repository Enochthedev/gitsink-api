import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Register a new user and create an API key.
   */
  async signup(email: string): Promise<User> {
    const apiKey = randomBytes(32).toString('hex');
    return this.prisma.user.create({ data: { email, apiKey } });
  }

  /**
   * Attach a GitHub ID to an existing user.
   */
  async connectGitHub(userId: string, githubId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId },
    });
  }

  /**
   * Generate a new API key for the user.
   */
  async regenerateApiKey(userId: string): Promise<User> {
    const apiKey = randomBytes(32).toString('hex');
    return this.prisma.user.update({
      where: { id: userId },
      data: { apiKey },
    });
  }

  async exchangeCodeForGitHubId(code: string): Promise<string> {
    const tokenResp = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: this.config.get<string>('GITHUB_CLIENT_ID'),
        client_secret: this.config.get<string>('GITHUB_CLIENT_SECRET'),
        code,
      },
      { headers: { Accept: 'application/json' } },
    );
    const token = tokenResp.data.access_token as string;
    const userResp = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` },
    });
    return String(userResp.data.id);
  }

  async oauth(userId: string, code: string): Promise<User> {
    const githubId = await this.exchangeCodeForGitHubId(code);
    return this.connectGitHub(userId, githubId);
  }
}
