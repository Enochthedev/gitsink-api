import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Counter, Gauge } from 'prom-client';
import { MetricsService } from '@metrics/metrics.service';
import { Request } from 'express';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  details: Record<string, any>;
  timestamp: Date;
}

export enum SecurityEventType {
  SUSPICIOUS_LOGIN = 'suspicious_login',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_TOKEN = 'invalid_token',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  SUSPICIOUS_USER_AGENT = 'suspicious_user_agent',
  MULTIPLE_FAILED_LOGINS = 'multiple_failed_logins',
  ACCOUNT_LOCKOUT = 'account_lockout',
  UNUSUAL_API_USAGE = 'unusual_api_usage',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_EXFILTRATION = 'data_exfiltration',
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface SuspiciousActivity {
  identifier: string;
  score: number;
  events: SecurityEvent[];
  firstSeen: Date;
  lastSeen: Date;
  isBlocked: boolean;
}

export interface SecurityAlert {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly securityEventCounter: Counter<string>;
  private readonly suspiciousActivityGauge: Gauge<string>;
  private readonly blockedIpsGauge: Gauge<string>;

  // Thresholds for suspicious activity detection
  private readonly suspiciousThresholds = {
    failedLoginsPerHour: 10,
    rateLimitHitsPerHour: 50,
    suspiciousScore: 100,
    autoBlockScore: 200,
  };

  // IP whitelist (can be configured via environment)
  private readonly ipWhitelist: Set<string> = new Set([
    '127.0.0.1',
    '::1',
    // Add more whitelisted IPs from config
  ]);

  // Blocked IPs cache
  private readonly blockedIps: Map<string, { until: Date; reason: string }> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly metricsService: MetricsService,
  ) {
    this.securityEventCounter = this.metricsService.createCustomCounter(
      'security_events_total',
      'Total number of security events',
      ['event_type', 'severity'],
    );

    this.suspiciousActivityGauge = this.metricsService.createCustomGauge(
      'suspicious_activity_score',
      'Current suspicious activity score',
      ['identifier_type'],
    );

    this.blockedIpsGauge = this.metricsService.createCustomGauge(
      'blocked_ips_total',
      'Total number of blocked IPs',
      [],
    );

    // Load IP whitelist from config
    this.loadIpWhitelist();
  }

  /**
   * Record a security event
   */
  async recordSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Record metrics
      this.securityEventCounter.inc({
        event_type: event.type,
        severity: event.severity,
      });

      // Store in audit log
      await this.prismaService.auditLog.create({
        data: {
          userId: event.userId,
          action: `security_event_${event.type}`,
          resource: 'security',
          details: {
            eventType: event.type,
            severity: event.severity,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            endpoint: event.endpoint,
            ...event.details,
          },
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          success: false,
          timestamp: event.timestamp,
        },
      });

      // Update suspicious activity tracking
      if (event.ipAddress || event.userId) {
        await this.updateSuspiciousActivity(event);
      }

      // Check if this event should trigger an alert
      await this.checkForAlerts(event);

      // Log the event
      this.logger.warn('Security event recorded', {
        type: event.type,
        severity: event.severity,
        userId: event.userId,
        ipAddress: event.ipAddress,
        endpoint: event.endpoint,
        details: event.details,
      });
    } catch (error) {
      this.logger.error('Error recording security event', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if an IP address is blocked
   */
  isIpBlocked(ipAddress: string): boolean {
    if (this.ipWhitelist.has(ipAddress)) {
      return false;
    }

    const blockInfo = this.blockedIps.get(ipAddress);
    if (!blockInfo) {
      return false;
    }

    // Check if block has expired
    if (blockInfo.until < new Date()) {
      this.blockedIps.delete(ipAddress);
      this.updateBlockedIpsMetric();
      return false;
    }

    return true;
  }

  /**
   * Block an IP address
   */
  async blockIp(
    ipAddress: string,
    reason: string,
    durationMinutes: number = 60,
    blockedBy?: string,
  ): Promise<void> {
    if (this.ipWhitelist.has(ipAddress)) {
      this.logger.warn('Attempted to block whitelisted IP', {
        ipAddress,
        reason,
        blockedBy,
      });
      return;
    }

    const until = new Date(Date.now() + durationMinutes * 60 * 1000);
    this.blockedIps.set(ipAddress, { until, reason });
    this.updateBlockedIpsMetric();

    // Record the block event
    await this.recordSecurityEvent({
      type: SecurityEventType.ACCOUNT_LOCKOUT,
      severity: SecuritySeverity.HIGH,
      ipAddress,
      details: {
        reason,
        durationMinutes,
        blockedBy,
        until: until.toISOString(),
      },
      timestamp: new Date(),
    });

    this.logger.warn('IP address blocked', {
      ipAddress,
      reason,
      durationMinutes,
      until,
      blockedBy,
    });
  }

  /**
   * Unblock an IP address
   */
  async unblockIp(ipAddress: string, unblockedBy?: string): Promise<void> {
    const wasBlocked = this.blockedIps.has(ipAddress);
    this.blockedIps.delete(ipAddress);
    this.updateBlockedIpsMetric();

    if (wasBlocked) {
      this.logger.log('IP address unblocked', {
        ipAddress,
        unblockedBy,
      });
    }
  }

  /**
   * Get suspicious activity for an identifier
   */
  async getSuspiciousActivity(identifier: string): Promise<SuspiciousActivity | null> {
    try {
      const cacheKey = `suspicious_activity:${identifier}`;
      const cached = await this.cacheManager.get<SuspiciousActivity>(cacheKey);

      if (cached) {
        return cached;
      }

      // If not in cache, calculate from recent audit logs
      const recentEvents = await this.getRecentSecurityEvents(identifier);
      if (recentEvents.length === 0) {
        return null;
      }

      const activity: SuspiciousActivity = {
        identifier,
        score: this.calculateSuspiciousScore(recentEvents),
        events: recentEvents,
        firstSeen: recentEvents[recentEvents.length - 1].timestamp,
        lastSeen: recentEvents[0].timestamp,
        isBlocked: this.isIdentifierBlocked(identifier),
      };

      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, activity, 5 * 60 * 1000);

      return activity;
    } catch (error) {
      this.logger.error('Error getting suspicious activity', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Detect suspicious patterns in request
   */
  async detectSuspiciousPatterns(req: Request): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const ipAddress = this.getClientIp(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    const path = req.path;

    // Check for SQL injection patterns
    if (this.containsSqlInjectionPatterns(req)) {
      events.push({
        type: SecurityEventType.SQL_INJECTION_ATTEMPT,
        severity: SecuritySeverity.HIGH,
        ipAddress,
        userAgent,
        endpoint: path,
        details: {
          query: req.query,
          body: this.sanitizeBody(req.body),
        },
        timestamp: new Date(),
      });
    }

    // Check for XSS patterns
    if (this.containsXssPatterns(req)) {
      events.push({
        type: SecurityEventType.XSS_ATTEMPT,
        severity: SecuritySeverity.MEDIUM,
        ipAddress,
        userAgent,
        endpoint: path,
        details: {
          query: req.query,
          body: this.sanitizeBody(req.body),
        },
        timestamp: new Date(),
      });
    }

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(userAgent)) {
      events.push({
        type: SecurityEventType.SUSPICIOUS_USER_AGENT,
        severity: SecuritySeverity.LOW,
        ipAddress,
        userAgent,
        endpoint: path,
        details: {
          userAgent,
        },
        timestamp: new Date(),
      });
    }

    return events;
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeRange?: { from: Date; to: Date }): Promise<{
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecuritySeverity, number>;
    blockedIps: number;
    suspiciousActivities: number;
    recentAlerts: SecurityAlert[];
  }> {
    const from = timeRange?.from || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = timeRange?.to || new Date();

    try {
      // Get events from audit log
      const events = await this.prismaService.auditLog.findMany({
        where: {
          action: {
            startsWith: 'security_event_',
          },
          timestamp: {
            gte: from,
            lte: to,
          },
        },
        select: {
          action: true,
          details: true,
          timestamp: true,
        },
      });

      // Process statistics
      const eventsByType: Record<string, number> = {};
      const eventsBySeverity: Record<string, number> = {};

      events.forEach(event => {
        const eventType = (event.details as any)?.eventType as string;
        const severity = (event.details as any)?.severity as string;

        if (eventType) {
          eventsByType[eventType] = (eventsByType[eventType] || 0) + 1;
        }
        if (severity) {
          eventsBySeverity[severity] = (eventsBySeverity[severity] || 0) + 1;
        }
      });

      return {
        totalEvents: events.length,
        eventsByType: eventsByType as Record<SecurityEventType, number>,
        eventsBySeverity: eventsBySeverity as Record<SecuritySeverity, number>,
        blockedIps: this.blockedIps.size,
        suspiciousActivities: 0, // Would need to implement proper tracking
        recentAlerts: [], // Would need to implement alert storage
      };
    } catch (error) {
      this.logger.error('Error getting security stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update suspicious activity tracking
   */
  private async updateSuspiciousActivity(event: SecurityEvent): Promise<void> {
    const identifier = event.userId ? `user:${event.userId}` : `ip:${event.ipAddress}`;
    const activity = await this.getSuspiciousActivity(identifier);

    let newScore = 0;
    if (activity) {
      newScore = activity.score + this.getEventScore(event);
    } else {
      newScore = this.getEventScore(event);
    }

    // Update metrics
    this.suspiciousActivityGauge.set({ identifier_type: event.userId ? 'user' : 'ip' }, newScore);

    // Check if we should auto-block
    if (newScore >= this.suspiciousThresholds.autoBlockScore && event.ipAddress) {
      await this.blockIp(
        event.ipAddress,
        `Auto-blocked due to suspicious activity score: ${newScore}`,
        120, // 2 hours
        'system',
      );
    }
  }

  /**
   * Get score for a security event
   */
  private getEventScore(event: SecurityEvent): number {
    const scores = {
      [SecurityEventType.SUSPICIOUS_LOGIN]: 10,
      [SecurityEventType.BRUTE_FORCE_ATTEMPT]: 25,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 5,
      [SecurityEventType.INVALID_TOKEN]: 15,
      [SecurityEventType.SQL_INJECTION_ATTEMPT]: 50,
      [SecurityEventType.XSS_ATTEMPT]: 30,
      [SecurityEventType.SUSPICIOUS_USER_AGENT]: 5,
      [SecurityEventType.MULTIPLE_FAILED_LOGINS]: 20,
      [SecurityEventType.UNUSUAL_API_USAGE]: 15,
      [SecurityEventType.PRIVILEGE_ESCALATION]: 100,
      [SecurityEventType.DATA_EXFILTRATION]: 100,
    };

    return scores[event.type] || 10;
  }

  /**
   * Check if identifier is blocked
   */
  private isIdentifierBlocked(identifier: string): boolean {
    if (identifier.startsWith('ip:')) {
      const ip = identifier.substring(3);
      return this.isIpBlocked(ip);
    }
    // Could implement user blocking here
    return false;
  }

  /**
   * Get recent security events for identifier
   */
  private async getRecentSecurityEvents(identifier: string): Promise<SecurityEvent[]> {
    const isUser = identifier.startsWith('user:');
    const isIp = identifier.startsWith('ip:');

    if (!isUser && !isIp) {
      return [];
    }

    const where: any = {
      action: {
        startsWith: 'security_event_',
      },
      timestamp: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    };

    if (isUser) {
      where.userId = identifier.substring(5);
    } else if (isIp) {
      where.ipAddress = identifier.substring(3);
    }

    const events = await this.prismaService.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return events.map(event => ({
      type: (event.details as any)?.eventType as SecurityEventType,
      severity: (event.details as any)?.severity as SecuritySeverity,
      userId: event.userId || undefined,
      ipAddress: event.ipAddress || undefined,
      userAgent: event.userAgent || undefined,
      endpoint: (event.details as any)?.endpoint,
      details: (event.details as Record<string, any>) || {},
      timestamp: event.timestamp,
    }));
  }

  /**
   * Calculate suspicious score from events
   */
  private calculateSuspiciousScore(events: SecurityEvent[]): number {
    return events.reduce((score, event) => score + this.getEventScore(event), 0);
  }

  /**
   * Check for alerts based on security event
   */
  private async checkForAlerts(event: SecurityEvent): Promise<void> {
    // High severity events always trigger alerts
    if (event.severity === SecuritySeverity.HIGH || event.severity === SecuritySeverity.CRITICAL) {
      // Would implement alert creation/notification here
      this.logger.error('High severity security event detected', {
        type: event.type,
        severity: event.severity,
        details: event.details,
      });
    }
  }

  /**
   * Load IP whitelist from configuration
   */
  private loadIpWhitelist(): void {
    const whitelistConfig = this.configService.get<string>('SECURITY_IP_WHITELIST');
    if (whitelistConfig) {
      const ips = whitelistConfig.split(',').map(ip => ip.trim());
      ips.forEach(ip => this.ipWhitelist.add(ip));
    }
  }

  /**
   * Update blocked IPs metric
   */
  private updateBlockedIpsMetric(): void {
    this.blockedIpsGauge.set(this.blockedIps.size);
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string {
    return (
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection as any)?.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Check for SQL injection patterns
   */
  private containsSqlInjectionPatterns(req: Request): boolean {
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+.*set/i,
      /or\s+1\s*=\s*1/i,
      /'.*or.*'/i,
      /exec\s*\(/i,
      /script\s*:/i,
    ];

    const textToCheck = JSON.stringify({
      ...req.query,
      ...req.body,
    }).toLowerCase();

    return sqlPatterns.some(pattern => pattern.test(textToCheck));
  }

  /**
   * Check for XSS patterns
   */
  private containsXssPatterns(req: Request): boolean {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /eval\s*\(/i,
      /<object/i,
      /<embed/i,
      /vbscript:/i,
    ];

    const textToCheck = JSON.stringify({ ...req.query, ...req.body });
    return xssPatterns.some(pattern => pattern.test(textToCheck));
  }

  /**
   * Check for suspicious user agent
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python-requests/i,
      /scanner/i,
      /crawler/i,
      /bot/i,
      /spider/i,
    ];

    // Allow legitimate bots
    const legitimateBots = [
      /googlebot/i,
      /bingbot/i,
      /slackbot/i,
      /facebookexternalhit/i,
      /twitterbot/i,
      /linkedinbot/i,
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
    const isLegitimate = legitimateBots.some(pattern => pattern.test(userAgent));

    return isSuspicious && !isLegitimate;
  }

  /**
   * Sanitize request body for logging
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
