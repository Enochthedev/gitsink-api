import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@auth/auth.service';
import { MetricsService } from '@metrics/metrics.service';
import { Counter } from 'prom-client';

interface AuthenticatedRequest extends Request {
  user?: any;
  apiKeyUsed?: boolean;
}

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiKeyMiddleware.name);
  private readonly apiKeyMetrics: Counter<string>;

  constructor(
    private readonly authService: AuthService,
    private readonly metricsService: MetricsService,
  ) {
    this.apiKeyMetrics = this.metricsService.createCustomCounter(
      'api_key_auth_total',
      'Total API key authentication attempts',
      ['result', 'endpoint'],
    );
  }

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    // Only apply to API routes that require API key authentication
    if (!this.requiresApiKey(req.path)) {
      return next();
    }

    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      this.apiKeyMetrics.inc({ result: 'missing', endpoint: req.path });
      throw new UnauthorizedException('API key required');
    }

    try {
      const clientInfo = {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
      };

      const user = await this.authService.validateApiKey(apiKey, clientInfo);

      if (!user) {
        this.apiKeyMetrics.inc({ result: 'invalid', endpoint: req.path });
        throw new UnauthorizedException('Invalid API key');
      }

      // Attach user to request
      req.user = user;
      req.apiKeyUsed = true;

      this.apiKeyMetrics.inc({ result: 'success', endpoint: req.path });

      this.logger.debug(
        `API key authentication successful for user ${user.id}`,
        {
          userId: user.id,
          endpoint: req.path,
          clientInfo,
        },
      );

      next();
    } catch (error) {
      this.apiKeyMetrics.inc({ result: 'error', endpoint: req.path });
      throw error;
    }
  }

  private requiresApiKey(path: string): boolean {
    // Define which paths require API key authentication
    const apiKeyRoutes = ['/api/', '/projects/', '/parser/'];

    return apiKeyRoutes.some((route) => path.startsWith(route));
  }

  private extractApiKey(req: Request): string | null {
    // Check multiple possible locations for API key
    const headerKey = req.get('x-api-key');
    const queryKey = req.query['api_key'] as string;
    const authHeader = req.get('authorization');

    if (headerKey) return headerKey;
    if (queryKey) return queryKey;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
