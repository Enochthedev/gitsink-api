import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigModule } from '@nestjs/config';
import { EmailTemplateService } from './templates/email-template.service';
import { EmailBounceService } from './bounce/email-bounce.service';
import { EmailWebhookController } from './bounce/email-webhook.controller';
import { EmailRetryService } from './retry/email-retry.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [EmailWebhookController],
  providers: [MailService, EmailTemplateService, EmailBounceService, EmailRetryService],
  exports: [MailService, EmailTemplateService, EmailBounceService, EmailRetryService],
})
export class MailModule {}
