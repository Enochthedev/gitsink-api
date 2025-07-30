import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { encrypt } from '../utils/encryption';
import * as bcrypt from 'bcryptjs';
import { EnqueueService } from '../queues/email/enqueue/enqueue.service';
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwt: JwtService,
    private enqueue: EnqueueService,
  ) {}

  /**
   * Register a new user and create an API key.
   */
  async signup(
    email: string,
    password?: string,
    username?: string,
  ): Promise<{ user: User; apiKey: string }> {
    const apiKey = randomBytes(32).toString('hex');
    const hashedKey = await bcrypt.hash(apiKey, 10);
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const user = await this.prisma.user.create({
      data: { email, username, apiKey: hashedKey, password: hashedPassword },
    });
    await this.enqueue.enqueueSignupEmail(email);
    return { user, apiKey };
  }

  sendSigninEmail(email: string) {
    return this.enqueue.enqueueSigninEmail(email);
  }

  sendForgotPassword(email: string, token: string) {
    return this.enqueue.enqueueForgotPassword(email, token);
  }

  sendPasswordResetConfirmation(email: string) {
    return this.enqueue.enqueuePasswordResetConfirmation(email);
  }

  getUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = randomBytes(16).toString('hex');
    const hashed = await bcrypt.hash(token, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashed,
        resetTokenExpires: new Date(Date.now() + 3600 * 1000),
      },
    });
    await this.sendForgotPassword(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const users = await this.prisma.user.findMany({
      where: { resetToken: { not: null } },
    });
    for (const u of users) {
      if (
        u.resetToken &&
        (await bcrypt.compare(token, u.resetToken)) &&
        u.resetTokenExpires &&
        u.resetTokenExpires > new Date()
      ) {
        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
          where: { id: u.id },
          data: { password: hashed, resetToken: null, resetTokenExpires: null },
        });
        await this.sendPasswordResetConfirmation(u.email);
        return true;
      }
    }
    return false;
  }

  /**
   * Attach a GitHub ID to an existing user.
   */
  async connectGitHub(
    userId: string,
    githubId: string,
    githubToken?: string,
  ): Promise<User> {
    // GitHub token may be undefined when linking via OAuth
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    const encrypted = githubToken
      ? key
        ? encrypt(githubToken, key)
        : githubToken
      : null;
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId, githubToken: encrypted },
    });
  }

  /**
   * Generate a new API key for the user.
   */
  async regenerateApiKey(
    userId: string,
  ): Promise<{ user: User; apiKey: string }> {
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
   * Validate an API key and return the associated user if it exists.
   */
  async validateApiKey(apiKey: string): Promise<User | null> {
    // Look up all users with an API key set and compare using bcrypt
    const users = await this.prisma.user.findMany({
      where: { apiKey: { not: null } },
    });
    for (const user of users) {
      if (user.apiKey && (await bcrypt.compare(apiKey, user.apiKey))) {
        return user;
      }
    }
    return null;
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

  generateJwt(user: User): string {
    const payload = { sub: user.id };
    return this.jwt.sign(payload);
  }
}
