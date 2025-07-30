import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from './api-key.guard';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GithubStrategy } from './github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GithubController } from './github.controller';
import { LocalAuthController } from './local-auth.controller';
import { QueuesModule } from '@queues/queues.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    QueuesModule,
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
    AuthResolver,
    GithubStrategy,
    JwtStrategy,
    ApiKeyGuard,
  ],
  controllers: [GithubController, LocalAuthController],
  exports: [ApiKeyGuard, AuthService],
})
export class AuthModule {}
