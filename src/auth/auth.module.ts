import { Module } from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { MagicLinkService } from '@auth/magic-link.service';
import { MagicLinkCleanupService } from '@auth/magic-link-cleanup.service';
import { ApiKeyService } from '@auth/api-key.service';
import { ApiKeyMetricsService } from '@auth/api-key-metrics.service';
import { JwtTokenService } from '@auth/jwt-token.service';
import { JwtTokenCleanupService } from '@auth/jwt-token-cleanup.service';
import { EnhancedJwtGuard } from '@auth/enhanced-jwt.guard';
import { AuthResolver } from '@auth/auth.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from '@auth/api-key.guard';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { GithubStrategy } from './github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from '@auth/auth.controller';
import { QueuesModule } from '@queues/queues.module';
import { MetricsModule } from '@metrics/metrics.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    QueuesModule,
    MetricsModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'secret',
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    MagicLinkService,
    MagicLinkCleanupService,
    ApiKeyService,
    ApiKeyMetricsService,
    JwtTokenService,
    JwtTokenCleanupService,
    AuthResolver,
    GithubStrategy,
    JwtStrategy,
    ApiKeyGuard,
    EnhancedJwtGuard,
  ],
  controllers: [AuthController],
  exports: [ApiKeyGuard, EnhancedJwtGuard, AuthService, MagicLinkService, ApiKeyService, JwtTokenService],
})
export class AuthModule { }
