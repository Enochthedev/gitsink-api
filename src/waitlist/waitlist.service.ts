import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async join(email: string) {
    const entry = await this.prisma.waitlistEntry.create({ data: { email } });
    await this.mail.sendWaitlistWelcome(email);
    return entry;
  }
}
