import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcryptjs';

@ApiTags('auth')
@Controller('auth')
export class LocalAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiBody({ type: SignupDto })
  @ApiOkResponse({ schema: { example: { apiKey: 'string' } } })
  async signup(
    @Body() body: SignupDto,
  ) {
    const { apiKey } = await this.authService.signup(
      body.email,
      body.password,
      body.username,
    );
    return { apiKey };
  }

  @Post('forgot-password')
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ schema: { example: { sent: true } } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(body.email);
    return { sent: true };
  }

  @Post('reset-password')
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  async resetPassword(
    @Body() body: ResetPasswordDto,
  ) {
    const ok = await this.authService.resetPassword(body.token, body.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid token');
    }
    return { success: true };
  }

  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ schema: { example: { token: 'jwt' } } })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() body: LoginDto) {
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
