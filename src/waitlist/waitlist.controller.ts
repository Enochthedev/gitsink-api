import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/waitlist.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Throttle({ short: { limit: 1, ttl: 5000 } })
  @Post()
  async join(@Body() dto: JoinWaitlistDto) {
    const start = Date.now();
    try {
      const result = await this.waitlist.join(dto.email);
      const duration = Date.now() - start;
      console.log(`[WAITLIST ✅] ${dto.email} joined in ${duration}ms`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to join waitlist for ${dto.email}:`, error);
      throw error;
    } finally {
      const duration = Date.now() - start;
      console.log(`[REQ] POST /waitlist took ${duration}ms`);
    }
  }
}
