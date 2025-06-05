import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

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
  async connectGitHub(userId: string, githubId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId },
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
}
