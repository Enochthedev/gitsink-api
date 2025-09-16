import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { SandboxResolver } from './sandbox.resolver';
import { SandboxDataService } from './sandbox-data.service';
import { SandboxGuard } from './sandbox.guard';
import { SandboxScheduler } from './sandbox.scheduler';
import { SandboxMigrationService } from './sandbox-migration.service';
import { SandboxIsolationService } from './sandbox-isolation.service';
import { SandboxCLIService } from './sandbox-cli.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [
    SandboxService,
    SandboxDataService,
    SandboxResolver,
    SandboxGuard,
    SandboxScheduler,
    SandboxMigrationService,
    SandboxIsolationService,
    SandboxCLIService,
  ],
  controllers: [SandboxController],
  exports: [
    SandboxService,
    SandboxDataService,
    SandboxGuard,
    SandboxMigrationService,
    SandboxIsolationService,
    SandboxCLIService,
  ],
})
export class SandboxModule {}
