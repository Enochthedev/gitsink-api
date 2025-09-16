import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditResolver } from './audit.resolver';
import { SyncHistoryService } from './sync-history.service';
import { SyncHistoryController } from './sync-history.controller';
import { SyncHistoryResolver } from './sync-history.resolver';
import { AuditReportingService } from './audit-reporting.service';
import { AuditReportingController } from './audit-reporting.controller';
import { AuditReportingResolver } from './audit-reporting.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [AuditController, SyncHistoryController, AuditReportingController],
  providers: [
    AuditService,
    AuditResolver,
    SyncHistoryService,
    SyncHistoryResolver,
    AuditReportingService,
    AuditReportingResolver,
  ],
  exports: [AuditService, SyncHistoryService, AuditReportingService],
})
export class AuditModule {}
