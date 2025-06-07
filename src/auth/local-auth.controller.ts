import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class LocalAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; apiKey: string }) {
    const user = await this.authService.validateApiKey(body.apiKey);
    if (!user || user.email !== body.email) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { token: this.authService.generateJwt(user) };
  }
}
