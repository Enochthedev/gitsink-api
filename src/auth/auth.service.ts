import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

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
}
