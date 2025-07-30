import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from '@mail/mail.service';
import { EnqueueService } from './email/enqueue/enqueue.service';
import { ProcessorService } from './email/processor/processor.service';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [ConfigModule, MailModule],
  providers: [MailService, EnqueueService, ProcessorService],
  exports: [EnqueueService],
})
export class QueuesModule {}
