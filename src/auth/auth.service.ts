import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { encrypt } from '../utils/encryption';

import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Register a new user and create an API key.
   */
  async signup(email: string): Promise<{ user: User; apiKey: string }> {
    const apiKey = randomBytes(32).toString('hex');
    const hashed = await bcrypt.hash(apiKey, 10);
    const user = await this.prisma.user.create({ data: { email, apiKey: hashed } });
    return { user, apiKey };
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
  async regenerateApiKey(userId: string): Promise<{ user: User; apiKey: string }> {
    const apiKey = randomBytes(32).toString('hex');
    const hashed = await bcrypt.hash(apiKey, 10);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { apiKey: hashed },
    });
    return { user, apiKey };
  }

  async revokeApiKey(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { apiKey: null },
    });
  }

  /**
   * Find or create a user using GitHub OAuth details.
   */
  async findOrCreateWithGitHub(
    githubId: string,
    accessToken: string,
    email?: string,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { githubId } });
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { accessToken },
      });
    }
    return this.prisma.user.create({
      data: {
        email: email ?? `${githubId}@github.local`,
        githubId,
        accessToken,
      },
    });
  }
}
