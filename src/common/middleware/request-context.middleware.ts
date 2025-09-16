import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { EnhancedLoggerService } from '../services/enhanced-logger.service';

export interface RequestWithContext extends Request {
    requestId: string;
    startTime: number;
    correlationId?: string;
    user?: {
        id: string;
        email?: string;
        username?: string;
    };
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    constructor(private readonly logger: EnhancedLoggerService) { }

    use(req: RequestWithContext, res: Response, next: NextFunction) {
        // Generate or extract request ID
        req.requestId = req.headers['x-request-id'] as string || uuidv4();

        // Extract correlation ID if present
        req.correlationId = req.headers['x-correlation-id'] as string;

        // Record request start time
        req.startTime = Date.now();

        // Set response headers
        res.setHeader('X-Request-ID', req.requestId);
        if (req.correlationId) {
            res.setHeader('X-Correlation-ID', req.correlationId);
        }

        // Log incoming request
        this.logger.logApiRequest(
            req.method,
            req.originalUrl,
            0, // Status code not available yet
            0, // Duration not available yet
            {
                requestId: req.requestId,
                correlationId: req.correlationId,
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    referer: req.get('Referer'),
                    contentType: req.get('Content-Type'),
                    contentLength: req.get('Content-Length'),
                },
            }
        );

        // Override res.end to capture response details
        const originalEnd = res.end;
        const middlewareContext = this;
        res.end = function (chunk?: any, encoding?: any, cb?: any) {
            const duration = Date.now() - req.startTime;

            // Log completed request
            middlewareContext.logger.logApiRequest(
                req.method,
                req.originalUrl,
                res.statusCode,
                duration,
                {
                    requestId: req.requestId,
                    correlationId: req.correlationId,
                    userId: req.user?.id,
                    metadata: {
                        responseSize: res.get('Content-Length'),
                        cacheStatus: res.get('X-Cache-Status'),
                    },
                }
            );

            // Call original end method
            return originalEnd.call(res, chunk, encoding, cb);
        };

        next();
    }
}

/**
 * Middleware to extract and validate user context from JWT tokens
 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
    constructor(private readonly logger: EnhancedLoggerService) { }

    use(req: RequestWithContext, res: Response, next: NextFunction) {
        // Extract user information from JWT token if present
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                // This would typically decode the JWT token
                // For now, we'll just extract basic info if available
                const token = authHeader.substring(7);

                // In a real implementation, you would decode the JWT here
                // and extract user information
                // req.user = decodeJWT(token);

                this.logger.logAuthentication(
                    'token_validation',
                    true,
                    'jwt',
                    {
                        requestId: req.requestId,
                        correlationId: req.correlationId,
                    }
                );
            } catch (error) {
                this.logger.logAuthentication(
                    'token_validation',
                    false,
                    'jwt',
                    {
                        requestId: req.requestId,
                        correlationId: req.correlationId,
                        metadata: {
                            error: error instanceof Error ? error.message : 'Unknown error',
                        },
                    }
                );
            }
        }

        next();
    }
}

/**
 * Middleware to track performance metrics
 */
@Injectable()
export class PerformanceTrackingMiddleware implements NestMiddleware {
    constructor(private readonly logger: EnhancedLoggerService) { }

    use(req: RequestWithContext, res: Response, next: NextFunction) {
        const startCpuUsage = process.cpuUsage();
        const startMemoryUsage = process.memoryUsage();

        // Override res.end to capture performance metrics
        const originalEnd = res.end;
        const middlewareContext = this;
        res.end = function (chunk?: any, encoding?: any, cb?: any) {
            const endCpuUsage = process.cpuUsage(startCpuUsage);
            const endMemoryUsage = process.memoryUsage();
            const duration = Date.now() - req.startTime;

            // Log performance metrics for slow requests
            if (duration > 1000) { // Log requests taking more than 1 second
                middlewareContext.logger.logPerformance(
                    `${req.method} ${req.route?.path || req.originalUrl}`,
                    {
                        requestId: req.requestId,
                        correlationId: req.correlationId,
                        userId: req.user?.id,
                        startTime: req.startTime,
                        endTime: Date.now(),
                        duration,
                        cpuUsage: endCpuUsage,
                        memoryUsage: endMemoryUsage,
                        metadata: {
                            statusCode: res.statusCode,
                            memoryDelta: {
                                rss: endMemoryUsage.rss - startMemoryUsage.rss,
                                heapUsed: endMemoryUsage.heapUsed - startMemoryUsage.heapUsed,
                                heapTotal: endMemoryUsage.heapTotal - startMemoryUsage.heapTotal,
                            },
                        },
                    }
                );
            }

            return originalEnd.call(res, chunk, encoding, cb);
        };

        next();
    }
}

/**
 * Middleware to detect and log security threats
 */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
    private readonly suspiciousPatterns = [
        /(\<script\>|\<\/script\>)/i, // XSS attempts
        /(union\s+select|drop\s+table|insert\s+into)/i, // SQL injection attempts
        /(\.\.\/|\.\.\\)/g, // Path traversal attempts
        /(<|>|"|'|&|;|\|)/g, // Potential injection characters
    ];

    constructor(private readonly logger: EnhancedLoggerService) { }

    use(req: RequestWithContext, res: Response, next: NextFunction) {
        const threats: string[] = [];

        // Check for suspicious patterns in URL
        if (this.containsSuspiciousPattern(req.originalUrl)) {
            threats.push('suspicious_url_pattern');
        }

        // Check for suspicious patterns in query parameters
        const queryString = JSON.stringify(req.query);
        if (this.containsSuspiciousPattern(queryString)) {
            threats.push('suspicious_query_parameters');
        }

        // Check for suspicious patterns in request body
        if (req.body && typeof req.body === 'object') {
            const bodyString = JSON.stringify(req.body);
            if (this.containsSuspiciousPattern(bodyString)) {
                threats.push('suspicious_request_body');
            }
        }

        // Check for suspicious headers
        const userAgent = req.get('User-Agent') || '';
        if (this.isSuspiciousUserAgent(userAgent)) {
            threats.push('suspicious_user_agent');
        }

        // Log security threats
        if (threats.length > 0) {
            this.logger.logSecurity(
                'potential_security_threat_detected',
                {
                    requestId: req.requestId,
                    correlationId: req.correlationId,
                    ip: req.ip,
                    userAgent,
                    endpoint: req.originalUrl,
                    method: req.method,
                    threat: threats.join(', '),
                    severity: this.calculateThreatSeverity(threats),
                    metadata: {
                        threats,
                        query: req.query,
                        headers: this.sanitizeHeaders(req.headers),
                    },
                }
            );
        }

        next();
    }

    private containsSuspiciousPattern(input: string): boolean {
        return this.suspiciousPatterns.some(pattern => pattern.test(input));
    }

    private isSuspiciousUserAgent(userAgent: string): boolean {
        const suspiciousAgents = [
            'sqlmap',
            'nikto',
            'nmap',
            'masscan',
            'burp',
            'owasp',
            'scanner',
        ];

        return suspiciousAgents.some(agent =>
            userAgent.toLowerCase().includes(agent)
        );
    }

    private calculateThreatSeverity(threats: string[]): 'low' | 'medium' | 'high' | 'critical' {
        if (threats.includes('suspicious_request_body') || threats.includes('suspicious_query_parameters')) {
            return 'high';
        }
        if (threats.includes('suspicious_url_pattern')) {
            return 'medium';
        }
        return 'low';
    }

    private sanitizeHeaders(headers: any): Record<string, string> {
        const sanitized: Record<string, string> = {};
        const safeHeaders = [
            'user-agent',
            'accept',
            'accept-language',
            'accept-encoding',
            'content-type',
            'content-length',
            'referer',
            'origin',
        ];

        for (const [key, value] of Object.entries(headers)) {
            if (safeHeaders.includes(key.toLowerCase())) {
                sanitized[key] = String(value);
            }
        }

        return sanitized;
    }
}