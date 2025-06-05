import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from './api-key.guard';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { GithubStrategy } from './github.strategy';
import { GithubController } from './github.controller';

@Module({
  imports: [PrismaModule, PassportModule, ConfigModule],
  providers: [AuthService, AuthResolver, GithubStrategy, ApiKeyGuard],
  controllers: [GithubController],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
