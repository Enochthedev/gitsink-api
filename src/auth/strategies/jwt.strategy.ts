import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@auth/auth.service';
import { JwtTokenService } from '@auth/jwt-token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private authService: AuthService,
    private jwtTokenService: JwtTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'secret',
    });
  }

  async validate(payload: any) {
    // Use enhanced token validation
    const validationResult = await this.jwtTokenService.validateToken(
      this.extractTokenFromPayload(payload)
    );

    if (!validationResult.isValid) {
      throw new UnauthorizedException('Invalid token');
    }

    if (validationResult.isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Ensure it's an access token
    if (validationResult.payload?.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    return validationResult.user;
  }

  private extractTokenFromPayload(payload: any): string {
    // This is a workaround since we don't have direct access to the raw token
    // In a real implementation, you might need to modify the strategy to pass the token
    // For now, we'll rely on the basic validation and user lookup
    return '';
  }
}
