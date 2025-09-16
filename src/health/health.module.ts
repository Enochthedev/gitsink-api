import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthResolver } from './health.resolver';
import { HealthService } from './health.service';
import { PubSubProvider } from '../common/providers/pubsub.provider';
import { PrismaModule } from '../prisma/prisma.module';
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'sync' }, { name: 'email' })],
  controllers: [HealthController],
  providers: [HealthService, HealthResolver, PubSubProvider],
  exports: [HealthService],
})
export class HealthModule {}
