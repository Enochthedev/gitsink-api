import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { LoggingService } from '../services/logging.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly loggingService: LoggingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextType = context.getType();

    if (contextType === 'http') {
      return this.handleHttpRequest(context, next);
    } else if ((contextType as string) === 'graphql') {
      return this.handleGraphQLRequest(context, next);
    }

    return next.handle();
  }

  private handleHttpRequest(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // Add request ID if not present
    if (!request.id) {
      request.id = uuidv4();
    }

    // Log request start
    this.loggingService.debug(`Incoming request: ${request.method} ${request.originalUrl}`, {
      requestId: request.id,
      method: request.method,
      endpoint: request.originalUrl,
      ip: request.ip || request.connection.remoteAddress,
      userAgent: request.get('User-Agent'),
      userId: request.user?.id,
    });

    return next.handle().pipe(
      tap(data => {
        const duration = Date.now() - startTime;

        // Log successful request
        this.loggingService.logHTTPRequest(request, response, duration);

        // Log business events based on endpoint
        this.logBusinessEvent(request, response, data, duration);
      }),
      catchError(error => {
        const duration = Date.now() - startTime;

        // Log error request
        this.loggingService.error(
          `Request failed: ${request.method} ${request.originalUrl}`,
          error.stack,
          {
            requestId: request.id,
            method: request.method,
            endpoint: request.originalUrl,
            statusCode: error.status || 500,
            duration,
            ip: request.ip || request.connection.remoteAddress,
            userAgent: request.get('User-Agent'),
            userId: request.user?.id,
            error,
          },
        );

        // Log security events for certain errors
        this.logSecurityEvent(request, error);

        return throwError(() => error);
      }),
    );
  }

  private handleGraphQLRequest(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlContext = context.getArgs()[2]; // GraphQL context
    const info = context.getArgs()[3]; // GraphQL info
    const startTime = Date.now();

    const requestId = gqlContext.req?.id || uuidv4();
    const operation = info?.operation?.operation;
    const fieldName = info?.fieldName;

    this.loggingService.debug(`GraphQL ${operation}: ${fieldName}`, {
      requestId,
      endpoint: `graphql:${fieldName}`,
      method: operation?.toUpperCase(),
      userId: gqlContext.req?.user?.id,
      ip: gqlContext.req?.ip,
    });

    return next.handle().pipe(
      tap(data => {
        const duration = Date.now() - startTime;

        this.loggingService.logPerformance(`GraphQL ${operation} completed`, {
          operation: `graphql_${operation}`,
          duration,
          requestId,
          endpoint: `graphql:${fieldName}`,
          userId: gqlContext.req?.user?.id,
          metadata: {
            fieldName,
            operation,
          },
        });
      }),
      catchError(error => {
        const duration = Date.now() - startTime;

        this.loggingService.error(`GraphQL ${operation} failed: ${fieldName}`, error.stack, {
          requestId,
          endpoint: `graphql:${fieldName}`,
          method: operation?.toUpperCase(),
          duration,
          userId: gqlContext.req?.user?.id,
          error,
          metadata: {
            fieldName,
            operation,
          },
        });

        return throwError(() => error);
      }),
    );
  }

  private logBusinessEvent(request: any, response: any, data: any, duration: number) {
    const endpoint = request.originalUrl;
    const method = request.method;
    const userId = request.user?.id;

    // Log user signup events
    if (endpoint.includes('/auth/signup') && method === 'POST' && response.statusCode === 201) {
      this.loggingService.logBusiness('User signup completed', {
        eventType: 'user_signup',
        requestId: request.id,
        userId: data?.user?.id,
        userTier: data?.user?.tier || 'free',
        duration,
        metadata: {
          signupMethod: data?.method || 'email',
        },
      });
    }

    // Log project sync events
    if (endpoint.includes('/projects/sync') && method === 'POST' && response.statusCode === 201) {
      this.loggingService.logBusiness('Project sync completed', {
        eventType: 'project_sync',
        requestId: request.id,
        userId,
        platform: data?.project?.platform || 'github',
        duration,
        metadata: {
          projectId: data?.project?.id,
          repositoryUrl: data?.project?.repositoryUrl,
        },
      });
    }

    // Log API calls
    if (endpoint.startsWith('/api/')) {
      this.loggingService.logBusiness('API call completed', {
        eventType: 'api_call',
        requestId: request.id,
        userId,
        endpoint,
        method,
        duration,
        userTier: request.user?.tier || 'free',
        metadata: {
          statusCode: response.statusCode,
          apiKeyType: request.apiKeyType || 'standard',
        },
      });
    }

    // Log profile views
    if (endpoint.includes('/profiles/') && method === 'GET' && response.statusCode === 200) {
      this.loggingService.logBusiness('Profile viewed', {
        eventType: 'profile_view',
        requestId: request.id,
        userId,
        duration,
        metadata: {
          profileId: data?.profile?.id,
          profileType: data?.profile?.isPublic ? 'public' : 'private',
          viewerType: userId ? 'authenticated' : 'anonymous',
        },
      });
    }
  }

  private logSecurityEvent(request: any, error: any) {
    const endpoint = request.originalUrl;
    const method = request.method;
    const statusCode = error.status || 500;
    const userId = request.user?.id;
    const ip = request.ip || request.connection.remoteAddress;
    const userAgent = request.get('User-Agent');

    // Log authentication failures
    if (statusCode === 401) {
      this.loggingService.logSecurity('Authentication failed', {
        eventType: 'auth_attempt',
        severity: 'medium',
        requestId: request.id,
        userId,
        ip,
        userAgent,
        endpoint,
        method,
        result: 'failure',
        source: ip,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          authMethod: this.detectAuthMethod(request),
        },
      });
    }

    // Log authorization failures
    if (statusCode === 403) {
      this.loggingService.logSecurity('Authorization failed', {
        eventType: 'permission_denied',
        severity: 'medium',
        requestId: request.id,
        userId,
        ip,
        userAgent,
        endpoint,
        method,
        result: 'blocked',
        source: ip,
        target: endpoint,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // Log rate limiting
    if (statusCode === 429) {
      this.loggingService.logSecurity('Rate limit exceeded', {
        eventType: 'rate_limit',
        severity: 'low',
        requestId: request.id,
        userId,
        ip,
        userAgent,
        endpoint,
        method,
        result: 'blocked',
        source: ip,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // Log suspicious activity (multiple rapid requests, unusual patterns)
    if (this.isSuspiciousActivity(request, error)) {
      this.loggingService.logSecurity('Suspicious activity detected', {
        eventType: 'suspicious_activity',
        severity: 'high',
        requestId: request.id,
        userId,
        ip,
        userAgent,
        endpoint,
        method,
        result: 'blocked',
        source: ip,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          suspiciousIndicators: this.getSuspiciousIndicators(request, error),
        },
      });
    }
  }

  private detectAuthMethod(request: any): string {
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return 'jwt';
    }
    if (request.headers['x-api-key']) {
      return 'api_key';
    }
    if (request.body?.email && request.body?.password) {
      return 'password';
    }
    return 'unknown';
  }

  private isSuspiciousActivity(request: any, error: any): boolean {
    // Simple heuristics for suspicious activity
    const userAgent = request.get('User-Agent') || '';
    const endpoint = request.originalUrl;

    // Check for bot-like user agents
    if (
      userAgent.includes('bot') ||
      userAgent.includes('crawler') ||
      userAgent.includes('spider')
    ) {
      return true;
    }

    // Check for attempts to access sensitive endpoints
    if (endpoint.includes('admin') || endpoint.includes('config') || endpoint.includes('debug')) {
      return true;
    }

    // Check for SQL injection attempts
    if (endpoint.includes('union') || endpoint.includes('select') || endpoint.includes('drop')) {
      return true;
    }

    return false;
  }

  private getSuspiciousIndicators(request: any, error: any): string[] {
    const indicators: string[] = [];
    const userAgent = request.get('User-Agent') || '';
    const endpoint = request.originalUrl;

    if (userAgent.includes('bot')) indicators.push('bot_user_agent');
    if (endpoint.includes('admin')) indicators.push('admin_endpoint_access');
    if (endpoint.includes('union')) indicators.push('sql_injection_attempt');
    if (!userAgent) indicators.push('missing_user_agent');

    return indicators;
  }
}
