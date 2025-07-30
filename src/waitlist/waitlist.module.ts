import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '@queues/queues.module';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [WaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
