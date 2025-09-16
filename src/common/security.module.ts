import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RateLimitingService } from './services/rate-limiting.service';
import { SecurityMonitoringService } from './services/security-monitoring.service';
import { AdvancedRateLimitGuard } from './guards/advanced-rate-limit.guard';
import { SecurityController } from './controllers/security.controller';
import { SecurityMiddleware } from './middleware/security.middleware';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [
    RateLimitingService,
    SecurityMonitoringService,
    AdvancedRateLimitGuard,
    SecurityMiddleware,
  ],
  controllers: [SecurityController],
  exports: [
    RateLimitingService,
    SecurityMonitoringService,
    AdvancedRateLimitGuard,
    SecurityMiddleware,
  ],
})
export class SecurityModule {}
