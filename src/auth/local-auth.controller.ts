import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcryptjs';

@ApiTags('auth')
@Controller('auth')
export class LocalAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body() body: { email: string; username?: string; password?: string },
  ) {
    const { apiKey } = await this.authService.signup(
      body.email,
      body.password,
      body.username,
    );
    return { apiKey };
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    await this.authService.requestPasswordReset(email);
    return { sent: true };
  }

  @Post('reset-password')
  async resetPassword(
    @Body() body: { token: string; password: string },
  ) {
    const ok = await this.authService.resetPassword(body.token, body.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid token');
    }
    return { success: true };
  }

  @Post('login')
  async login(@Body() body: { email: string; password?: string }) {
    const user = await this.authService.getUserByEmail(body.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.password) {
      if (!body.password) {
        throw new UnauthorizedException('Password required');
      }
      const ok = await bcrypt.compare(body.password, user.password);
      if (!ok) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }
    await this.authService.sendSigninEmail(user.email);
    return { token: this.authService.generateJwt(user) };
  }
}
