import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtTokenService } from './jwt-token.service';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestWithUser } from './request-with-user';

@Injectable()
export class EnhancedJwtGuard implements CanActivate {
    constructor(private readonly jwtTokenService: JwtTokenService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const type = context.getType<'http' | 'graphql'>();
        const request: RequestWithUser =
            type === 'http'
                ? context.switchToHttp().getRequest()
                : (GqlExecutionContext.create(context).getContext()
                    .req as RequestWithUser);

        // Extract JWT token from Authorization header
        const authHeader = request.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('JWT token missing');
        }

        const token = authHeader.slice(7);

        // Validate token using enhanced service
        const validationResult = await this.jwtTokenService.validateToken(token);

        if (!validationResult.isValid) {
            throw new UnauthorizedException('Invalid JWT token');
        }

        if (validationResult.isBlacklisted) {
            throw new UnauthorizedException('Token has been revoked');
        }

        // Ensure it's an access token
        if (validationResult.payload?.type !== 'access') {
            throw new UnauthorizedException('Invalid token type');
        }

        // Attach user and token info to request
        request.user = validationResult.user;
        request.tokenPayload = validationResult.payload;

        return true;
    }
}