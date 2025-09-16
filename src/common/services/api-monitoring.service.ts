import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service';
import { Request, Response } from 'express';

export interface ApiMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  requestSize: number;
  responseSize: number;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  timestamp: Date;
}

export interface EndpointStats {
  endpoint: string;
  method: string;
  totalRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number; // requests per second
  lastUpdated: Date;
}

export interface PerformanceAlert {
  type: 'slow_response' | 'high_error_rate' | 'high_throughput' | 'memory_usage';
  endpoint: string;
  method: string;
  value: number;
  threshold: number;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

@Injectable()
export class ApiMonitoringService {
  private readonly logger = new Logger(ApiMonitoringService.name);
  private readonly metricsBuffer: Map<string, ApiMetrics[]> = new Map();
  private readonly endpointStats: Map<string, EndpointStats> = new Map();
  private readonly performanceThresholds: Map<string, number> = new Map();
  private readonly bufferSize: number;
  private readonly flushInterval: number;
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.bufferSize = this.configService.get<number>('API_METRICS_BUFFER_SIZE', 1000);
    this.flushInterval = this.configService.get<number>('API_METRICS_FLUSH_INTERVAL', 60000); // 1 minute

    this.initializeThresholds();
    this.startPeriodicFlush();
  }

  /**
   * Record API request metrics
   */
  recordApiRequest(
    request: Request,
    response: Response,
    responseTime: number,
    requestSize: number = 0,
    responseSize: number = 0,
  ): void {
    const endpoint = this.normalizeEndpoint(request.route?.path || request.path);
    const method = request.method.toLowerCase();
    const statusCode = response.statusCode;

    const metrics: ApiMetrics = {
      endpoint,
      method,
      statusCode,
      responseTime,
      requestSize,
      responseSize,
      userAgent: request.get('User-Agent'),
      ipAddress: this.getClientIp(request),
      userId: (request as any).user?.id,
      timestamp: new Date(),
    };

    // Add to buffer
    const key = `${method}:${endpoint}`;
    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    const buffer = this.metricsBuffer.get(key)!;
    buffer.push(metrics);

    // Flush if buffer is full
    if (buffer.length >= this.bufferSize) {
      this.flushMetrics(key);
    }

    // Record real-time metrics
    this.metricsService.recordAPICall(endpoint, method, statusCode, responseTime);

    // Check for performance alerts
    this.checkPerformanceAlerts(metrics);

    // Update endpoint statistics
    this.updateEndpointStats(key, metrics);
  }

  /**
   * Get endpoint performance statistics
   */
  getEndpointStats(endpoint?: string, method?: string): EndpointStats[] {
    const stats: EndpointStats[] = [];

    for (const [key, stat] of this.endpointStats.entries()) {
      if (endpoint && !stat.endpoint.includes(endpoint)) continue;
      if (method && stat.method !== method.toLowerCase()) continue;

      stats.push({ ...stat });
    }

    return stats.sort((a, b) => b.totalRequests - a.totalRequests);
  }

  /**
   * Get slow endpoints
   */
  getSlowEndpoints(threshold: number = 1000, limit: number = 10): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(stat => stat.averageResponseTime > threshold)
      .sort((a, b) => b.averageResponseTime - a.averageResponseTime)
      .slice(0, limit);
  }

  /**
   * Get endpoints with high error rates
   */
  getHighErrorRateEndpoints(threshold: number = 0.05, limit: number = 10): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(stat => stat.errorRate > threshold)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit);
  }

  /**
   * Get API performance summary
   */
  getPerformanceSummary(timeWindow: number = 3600000): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
    topEndpoints: EndpointStats[];
    slowEndpoints: EndpointStats[];
    errorEndpoints: EndpointStats[];
  } {
    const stats = Array.from(this.endpointStats.values());
    const cutoffTime = new Date(Date.now() - timeWindow);

    // Filter recent stats
    const recentStats = stats.filter(stat => stat.lastUpdated > cutoffTime);

    const totalRequests = recentStats.reduce((sum, stat) => sum + stat.totalRequests, 0);
    const totalResponseTime = recentStats.reduce(
      (sum, stat) => sum + stat.averageResponseTime * stat.totalRequests,
      0,
    );
    const totalErrors = recentStats.reduce(
      (sum, stat) => sum + stat.totalRequests * stat.errorRate,
      0,
    );

    const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const throughput = totalRequests / (timeWindow / 1000); // requests per second

    return {
      totalRequests,
      averageResponseTime,
      errorRate,
      throughput,
      topEndpoints: recentStats.sort((a, b) => b.totalRequests - a.totalRequests).slice(0, 10),
      slowEndpoints: this.getSlowEndpoints(1000, 5),
      errorEndpoints: this.getHighErrorRateEndpoints(0.05, 5),
    };
  }

  /**
   * Set performance threshold for an endpoint
   */
  setPerformanceThreshold(endpoint: string, method: string, threshold: number): void {
    const key = `${method.toLowerCase()}:${endpoint}`;
    this.performanceThresholds.set(key, threshold);
    this.logger.debug(`Set performance threshold for ${key}: ${threshold}ms`);
  }

  /**
   * Get performance alerts
   */
  getPerformanceAlerts(limit: number = 50): PerformanceAlert[] {
    // This would typically be stored in a database or cache
    // For now, we'll return recent alerts from memory
    return [];
  }

  /**
   * Clear metrics and statistics
   */
  clearMetrics(): void {
    this.metricsBuffer.clear();
    this.endpointStats.clear();
    this.logger.log('API metrics cleared');
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): {
    endpoints: EndpointStats[];
    summary: any;
    timestamp: Date;
  } {
    return {
      endpoints: Array.from(this.endpointStats.values()),
      summary: this.getPerformanceSummary(),
      timestamp: new Date(),
    };
  }

  private initializeThresholds(): void {
    // Set default performance thresholds
    const defaultThresholds = {
      'get:/api/projects': 500,
      'post:/api/projects': 1000,
      'get:/api/users': 300,
      'post:/api/auth/login': 800,
      'post:/api/auth/signup': 1200,
    };

    for (const [endpoint, threshold] of Object.entries(defaultThresholds)) {
      this.performanceThresholds.set(endpoint, threshold);
    }
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushAllMetrics();
    }, this.flushInterval);
  }

  private flushAllMetrics(): void {
    for (const key of this.metricsBuffer.keys()) {
      this.flushMetrics(key);
    }
  }

  private flushMetrics(key: string): void {
    const buffer = this.metricsBuffer.get(key);
    if (!buffer || buffer.length === 0) return;

    // Process metrics (could send to external monitoring system)
    this.logger.debug(`Flushing ${buffer.length} metrics for ${key}`);

    // Clear buffer
    this.metricsBuffer.set(key, []);
  }

  private updateEndpointStats(key: string, metrics: ApiMetrics): void {
    let stats = this.endpointStats.get(key);

    if (!stats) {
      stats = {
        endpoint: metrics.endpoint,
        method: metrics.method,
        totalRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        throughput: 0,
        lastUpdated: new Date(),
      };
      this.endpointStats.set(key, stats);
    }

    // Update statistics
    stats.totalRequests++;
    stats.averageResponseTime =
      (stats.averageResponseTime * (stats.totalRequests - 1) + metrics.responseTime) /
      stats.totalRequests;
    stats.minResponseTime = Math.min(stats.minResponseTime, metrics.responseTime);
    stats.maxResponseTime = Math.max(stats.maxResponseTime, metrics.responseTime);

    // Update error rate
    const isError = metrics.statusCode >= 400;
    const previousErrors = stats.errorRate * (stats.totalRequests - 1);
    stats.errorRate = (previousErrors + (isError ? 1 : 0)) / stats.totalRequests;

    stats.lastUpdated = new Date();

    // Calculate percentiles (simplified - would need full data for accurate percentiles)
    stats.p50ResponseTime = stats.averageResponseTime;
    stats.p95ResponseTime = stats.averageResponseTime * 1.5;
    stats.p99ResponseTime = stats.maxResponseTime;

    // Calculate throughput (requests per second over last minute)
    const timeWindow = 60000; // 1 minute
    const recentRequests = this.getRecentRequestCount(key, timeWindow);
    stats.throughput = recentRequests / (timeWindow / 1000);
  }

  private getRecentRequestCount(key: string, timeWindow: number): number {
    const buffer = this.metricsBuffer.get(key) || [];
    const cutoffTime = new Date(Date.now() - timeWindow);

    return buffer.filter(metric => metric.timestamp > cutoffTime).length;
  }

  private checkPerformanceAlerts(metrics: ApiMetrics): void {
    const key = `${metrics.method}:${metrics.endpoint}`;
    const threshold = this.performanceThresholds.get(key);

    if (threshold && metrics.responseTime > threshold) {
      const severity = this.calculateSeverity(metrics.responseTime, threshold);

      const alert: PerformanceAlert = {
        type: 'slow_response',
        endpoint: metrics.endpoint,
        method: metrics.method,
        value: metrics.responseTime,
        threshold,
        timestamp: new Date(),
        severity,
      };

      this.handlePerformanceAlert(alert);
    }

    // Check for high error rate
    if (metrics.statusCode >= 500) {
      const stats = this.endpointStats.get(key);
      if (stats && stats.errorRate > 0.1) {
        // 10% error rate
        const alert: PerformanceAlert = {
          type: 'high_error_rate',
          endpoint: metrics.endpoint,
          method: metrics.method,
          value: stats.errorRate,
          threshold: 0.1,
          timestamp: new Date(),
          severity: 'high',
        };

        this.handlePerformanceAlert(alert);
      }
    }
  }

  private calculateSeverity(value: number, threshold: number): PerformanceAlert['severity'] {
    const ratio = value / threshold;

    if (ratio >= 5) return 'critical';
    if (ratio >= 3) return 'high';
    if (ratio >= 2) return 'medium';
    return 'low';
  }

  private handlePerformanceAlert(alert: PerformanceAlert): void {
    this.logger.warn(
      `Performance alert: ${alert.type} for ${alert.method.toUpperCase()} ${alert.endpoint} ` +
        `(${alert.value} > ${alert.threshold}) - Severity: ${alert.severity}`,
    );

    // Could send to external alerting system
    // Could store in database for dashboard
    // Could trigger auto-scaling or other remediation actions
  }

  private normalizeEndpoint(path: string): string {
    // Normalize path parameters to reduce cardinality
    return path
      .replace(/\/\d+/g, '/:id') // Replace numeric IDs
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid') // Replace UUIDs
      .replace(/\/[a-f0-9]{24}/g, '/:objectId') // Replace MongoDB ObjectIds
      .replace(/\?.*$/, ''); // Remove query parameters
  }

  private getClientIp(request: Request): string {
    return (
      request.get('X-Forwarded-For') ||
      request.get('X-Real-IP') ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushAllMetrics();
  }
}
