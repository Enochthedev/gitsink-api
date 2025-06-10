import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  async join(@Body('email') email: string) {
    await this.waitlist.join(email);
    return { joined: true };
  }
}
