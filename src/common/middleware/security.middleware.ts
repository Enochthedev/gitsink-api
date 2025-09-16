import { Injectable, NestMiddleware, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Counter } from 'prom-client';
import { MetricsService } from '@metrics/metrics.service';
import {
  SecurityMonitoringService,
  SecurityEventType,
  SecuritySeverity,
} from '../services/security-monitoring.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);
  private readonly suspiciousRequests: Map<string, number> = new Map();
  private readonly securityMetrics: Counter<string>;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {
    this.securityMetrics = this.metricsService.createCustomCounter(
      'security_events_total',
      'Total number of security events detected',
      ['event_type', 'severity'],
    );
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const path = req.path;

    try {
      // Check if IP is blocked
      if (this.securityMonitoringService.isIpBlocked(clientIp)) {
        this.logger.warn('Blocked IP attempted access', {
          ip: clientIp,
          userAgent,
          path,
        });

        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            message: 'Access denied. Your IP address has been temporarily blocked.',
            error: 'Forbidden',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      // Detect suspicious patterns
      const suspiciousEvents = await this.securityMonitoringService.detectSuspiciousPatterns(req);

      // Record any detected security events
      for (const event of suspiciousEvents) {
        await this.securityMonitoringService.recordSecurityEvent(event);
      }

      // Track suspicious patterns (legacy method for backward compatibility)
      this.detectSuspiciousActivity(req, clientIp, userAgent, path);

      // Add security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Add request ID for tracing
      req.headers['x-request-id'] = req.headers['x-request-id'] || this.generateRequestId();

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Error in security middleware', {
        error: error instanceof Error ? error.message : String(error),
        ip: clientIp,
        path,
      });

      next();
    }
  }

  private detectSuspiciousActivity(
    req: Request,
    clientIp: string,
    userAgent: string,
    path: string,
  ) {
    // Detect potential SQL injection attempts
    if (this.containsSqlInjectionPatterns(req)) {
      this.logger.warn('Potential SQL injection attempt detected', {
        ip: clientIp,
        userAgent,
        path,
        query: req.query,
        body: JSON.stringify(req.body),
      });
      this.securityMetrics.inc({
        event_type: 'sql_injection_attempt',
        severity: 'high',
      });
    }

    // Detect potential XSS attempts
    if (this.containsXssPatterns(req)) {
      this.logger.warn('Potential XSS attempt detected', {
        ip: clientIp,
        userAgent,
        path,
      });
      this.securityMetrics.inc({
        event_type: 'xss_attempt',
        severity: 'medium',
      });
    }

    // Detect suspicious user agents
    if (this.isSuspiciousUserAgent(userAgent)) {
      this.logger.warn('Suspicious user agent detected', {
        ip: clientIp,
        userAgent,
        path,
      });
      this.securityMetrics.inc({
        event_type: 'suspicious_user_agent',
        severity: 'low',
      });
    }

    // Track request frequency per IP
    const currentCount = this.suspiciousRequests.get(clientIp) || 0;
    this.suspiciousRequests.set(clientIp, currentCount + 1);

    // Clean up old entries every 1000 requests
    if (this.suspiciousRequests.size > 1000) {
      this.cleanupSuspiciousRequests();
    }
  }

  private containsSqlInjectionPatterns(req: Request): boolean {
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+.*set/i,
      /or\s+1\s*=\s*1/i,
      /'.*or.*'/i,
    ];

    const textToCheck = JSON.stringify({
      ...req.query,
      ...req.body,
    }).toLowerCase();
    return sqlPatterns.some(pattern => pattern.test(textToCheck));
  }

  private containsXssPatterns(req: Request): boolean {
    const xssPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i, /<iframe/i, /eval\s*\(/i];

    const textToCheck = JSON.stringify({ ...req.query, ...req.body });
    return xssPatterns.some(pattern => pattern.test(textToCheck));
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [/curl/i, /wget/i, /python/i, /bot/i, /scanner/i, /crawler/i];

    // Allow legitimate bots but flag others
    const legitimateBots = [/googlebot/i, /bingbot/i, /slackbot/i, /facebookexternalhit/i];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
    const isLegitimate = legitimateBots.some(pattern => pattern.test(userAgent));

    return isSuspicious && !isLegitimate;
  }

  private cleanupSuspiciousRequests() {
    // Keep only the most recent 500 entries
    const entries = Array.from(this.suspiciousRequests.entries());
    const keep = entries.slice(-500);
    this.suspiciousRequests.clear();
    keep.forEach(([key, value]) => this.suspiciousRequests.set(key, value));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
