import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class GithubController {
  constructor(private readonly authService: AuthService) {}

  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubLogin() {}

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const { accessToken, githubId, email } = req.user as {
      accessToken: string;
      githubId: string;
      email?: string;
    };
    const user = await this.authService.findOrCreateWithGitHub(
      githubId,
      accessToken,
      email,
    );
    const token = this.authService.generateJwt(user);
    return res.json({ token });
  }
}
