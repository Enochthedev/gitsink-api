import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { MagicLinkCleanupService } from './magic-link-cleanup.service';
import { ApiKeyService } from './api-key.service';
import { ApiKeyMetricsService } from './api-key-metrics.service';
import { JwtTokenService } from './jwt-token.service';
import { JwtTokenCleanupService } from './jwt-token-cleanup.service';
import { EnhancedJwtGuard } from './enhanced-jwt.guard';
import { AuthResolver } from './auth.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from '@auth/api-key.guard';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { GithubStrategy } from './github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from '@auth/auth.controller';
import { GithubController } from './github.controller';
import { QueueCoreModule } from '../queues/queue-core.module';


@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,

    QueueCoreModule,
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
  controllers: [AuthController, GithubController],
  exports: [
    ApiKeyGuard,
    EnhancedJwtGuard,
    AuthService,
    MagicLinkService,
    ApiKeyService,
    JwtTokenService,
  ],
})
export class AuthModule { }
