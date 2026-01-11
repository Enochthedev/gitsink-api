import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/waitlist.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) { }

  @Throttle({ short: { limit: 1, ttl: 5000 } })
  @Post()
  @ApiOperation({ summary: 'Join the waitlist', description: 'Add an email to the GitSink waitlist to receive early access notifications' })
  @ApiBody({ type: JoinWaitlistDto })
  @ApiResponse({
    status: 201,
    description: 'Successfully joined the waitlist',
    schema: {
      example: {
        success: true,
        message: 'You have been added to the waitlist',
        email: 'user@example.com',
        position: 42
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({ status: 429, description: 'Too many requests - rate limited' })
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
