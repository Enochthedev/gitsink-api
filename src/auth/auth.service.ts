import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { encrypt } from '../utils/encryption';

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
  async connectGitHub(
    userId: string,
    githubId: string,
    githubToken: string,
  ): Promise<User> {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    const encrypted = key ? encrypt(githubToken, key) : githubToken;
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId, githubToken: encrypted },
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
}
