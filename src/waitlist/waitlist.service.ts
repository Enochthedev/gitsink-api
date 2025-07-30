import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueService } from '../queues/email/enqueue/enqueue.service';
@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private enqueue: EnqueueService,
  ) {}

  async join(email: string) {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException('A valid email is required');
    }
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });
    if (existing) {
      // optionally, you could also return a flag to indicate they're already on the waitlist
      throw new ConflictException('This email is already on the waitlist');
    }
    const entry = await this.prisma.waitlistEntry.create({ data: { email } });
    // edge cases
    if (!entry) {
      throw new Error('Failed to create waitlist entry');
    }
    // if the entry already exists, we don't send a welcome email and tell the user they are already on the waitlist

    await this.enqueue.enqueueWaitlistWelcome(email);
    return {
      joined: true,
      message: 'Successfully added to the waitlist.',
    };
  }
}
