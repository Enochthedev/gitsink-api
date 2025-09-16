import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge, register } from 'prom-client';

export interface SecurityEvent {
  type:
    | 'auth_failure'
    | 'rate_limit_exceeded'
    | 'suspicious_activity'
    | 'token_abuse'
    | 'api_key_misuse';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export interface BusinessMetrics {
  userSignups: number;
  projectSyncs: number;
  apiCalls: number;
  profileViews: number;
  activeUsers: number;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  // Business Metrics
  private userSignupsCounter!: Counter<string>;
  private projectSyncsCounter!: Counter<string>;
  private apiCallsCounter!: Counter<string>;
  private profileViewsCounter!: Counter<string>;
  private activeUsersGauge!: Gauge<string>;
  private syncDurationHistogram!: Histogram<string>;
  private enrichmentJobsCounter!: Counter<string>;

  // Performance Metrics
  private cacheHitsCounter!: Counter<string>;
  private queueJobsCounter!: Counter<string>;
  private queueJobDurationHistogram!: Histogram<string>;
  private externalApiCallsCounter!: Counter<string>;
  private externalApiDurationHistogram!: Histogram<string>;

  // Security Metrics
  private authAttemptsCounter!: Counter<string>;
  private rateLimitHitsCounter!: Counter<string>;
  private securityEventsCounter!: Counter<string>;
  private apiKeyUsageCounter!: Counter<string>;
  private suspiciousActivityCounter!: Counter<string>;

  // System Health Metrics
  private systemHealthGauge!: Gauge<string>;
  private errorRateGauge!: Gauge<string>;
  private responseTimeGauge!: Gauge<string>;

  constructor(
    @InjectMetric('http_requests_total')
    public httpRequestsTotal: Counter<string>,

    @InjectMetric('http_request_duration_seconds')
    public httpRequestDuration: Histogram<string>,

    @InjectMetric('active_connections')
    public activeConnections: Gauge<string>,

    @InjectMetric('database_queries_total')
    public databaseQueriesTotal: Counter<string>,

    @InjectMetric('database_query_duration_seconds')
    public databaseQueryDuration: Histogram<string>,

    @InjectMetric('memory_usage_bytes')
    public memoryUsage: Gauge<string>,
  ) {}

  onModuleInit() {
    this.initializeCustomMetrics();
    this.startMemoryUsageTracking();
    this.startSystemHealthTracking();
  }

  private initializeCustomMetrics() {
    // Business Metrics
    this.userSignupsCounter = this.createCustomCounter(
      'user_signups_total',
      'Total number of user signups',
      ['method', 'source'],
    );

    this.projectSyncsCounter = this.createCustomCounter(
      'project_syncs_total',
      'Total number of project syncs',
      ['platform', 'status', 'user_tier'],
    );

    this.apiCallsCounter = this.createCustomCounter(
      'api_calls_total',
      'Total number of API calls',
      ['endpoint', 'method', 'user_tier', 'api_key_type'],
    );

    this.profileViewsCounter = this.createCustomCounter(
      'profile_views_total',
      'Total number of profile views',
      ['profile_type', 'source'],
    );

    this.activeUsersGauge = this.createCustomGauge('active_users', 'Number of active users', [
      'time_window',
    ]);

    this.syncDurationHistogram = this.createCustomHistogram(
      'sync_duration_seconds',
      'Duration of sync operations',
      ['platform', 'operation_type'],
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    );

    this.enrichmentJobsCounter = this.createCustomCounter(
      'enrichment_jobs_total',
      'Total number of AI enrichment jobs',
      ['job_type', 'status', 'model'],
    );

    // Performance Metrics
    this.cacheHitsCounter = this.createCustomCounter(
      'cache_operations_total',
      'Total number of cache operations',
      ['operation', 'result', 'cache_type'],
    );

    this.queueJobsCounter = this.createCustomCounter(
      'queue_jobs_total',
      'Total number of queue jobs',
      ['queue_name', 'job_type', 'status'],
    );

    this.queueJobDurationHistogram = this.createCustomHistogram(
      'queue_job_duration_seconds',
      'Duration of queue job processing',
      ['queue_name', 'job_type'],
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
    );

    this.externalApiCallsCounter = this.createCustomCounter(
      'external_api_calls_total',
      'Total number of external API calls',
      ['service', 'endpoint', 'status'],
    );

    this.externalApiDurationHistogram = this.createCustomHistogram(
      'external_api_duration_seconds',
      'Duration of external API calls',
      ['service', 'endpoint'],
      [0.1, 0.5, 1, 2, 5, 10, 30],
    );

    // Security Metrics
    this.authAttemptsCounter = this.createCustomCounter(
      'auth_attempts_total',
      'Total number of authentication attempts',
      ['method', 'status', 'reason'],
    );

    this.rateLimitHitsCounter = this.createCustomCounter(
      'rate_limit_hits_total',
      'Total number of rate limit hits',
      ['endpoint', 'user_tier', 'limit_type'],
    );

    this.securityEventsCounter = this.createCustomCounter(
      'security_events_total',
      'Total number of security events',
      ['event_type', 'severity', 'source'],
    );

    this.apiKeyUsageCounter = this.createCustomCounter(
      'api_key_usage_total',
      'Total API key usage',
      ['key_type', 'endpoint', 'status'],
    );

    this.suspiciousActivityCounter = this.createCustomCounter(
      'suspicious_activity_total',
      'Total suspicious activity events',
      ['activity_type', 'severity'],
    );

    // System Health Metrics
    this.systemHealthGauge = this.createCustomGauge(
      'system_health_score',
      'Overall system health score (0-1)',
      ['component'],
    );

    this.errorRateGauge = this.createCustomGauge('error_rate', 'Current error rate percentage', [
      'service',
      'time_window',
    ]);

    this.responseTimeGauge = this.createCustomGauge(
      'avg_response_time_seconds',
      'Average response time in seconds',
      ['endpoint', 'time_window'],
    );

    this.logger.log('Custom metrics initialized successfully');
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // HTTP Request tracking
  incrementHttpRequests(method: string, route: string, statusCode: number) {
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordHttpRequestDuration(method: string, route: string, duration: number) {
    this.httpRequestDuration.observe({ method, route }, duration);
  }

  // Database tracking
  incrementDatabaseQueries(operation: string, table?: string) {
    this.databaseQueriesTotal.inc({
      operation,
      table: table || 'unknown',
    });
  }

  recordDatabaseQueryDuration(operation: string, duration: number, table?: string) {
    this.databaseQueryDuration.observe({ operation, table: table || 'unknown' }, duration);
  }

  // Connection tracking
  setActiveConnections(count: number) {
    this.activeConnections.set(count);
  }

  incrementActiveConnections() {
    this.activeConnections.inc();
  }

  decrementActiveConnections() {
    this.activeConnections.dec();
  }

  // Memory usage tracking
  private startMemoryUsageTracking() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.memoryUsage.set({ type: 'external' }, memUsage.external);
    }, 5000);
  }

  // Business Metrics Methods
  recordUserSignup(method: 'email' | 'github' | 'magic_link', source: string = 'web') {
    this.userSignupsCounter.inc({ method, source });
    this.logger.debug(`User signup recorded: ${method} from ${source}`);
  }

  recordProjectSync(
    platform: string,
    success: boolean,
    duration: number,
    userTier: string = 'free',
  ) {
    const status = success ? 'success' : 'failure';
    this.projectSyncsCounter.inc({ platform, status, user_tier: userTier });
    this.syncDurationHistogram.observe({ platform, operation_type: 'sync' }, duration / 1000);
    this.logger.debug(`Project sync recorded: ${platform} - ${status} - ${duration}ms`);
  }

  recordAPICall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    userTier: string = 'free',
    apiKeyType: string = 'standard',
  ) {
    this.apiCallsCounter.inc({
      endpoint,
      method,
      user_tier: userTier,
      api_key_type: apiKeyType,
    });
    this.logger.debug(`API call recorded: ${method} ${endpoint} - ${statusCode} - ${duration}ms`);
  }

  recordProfileView(
    profileId: string,
    profileType: 'public' | 'private' = 'public',
    source: string = 'direct',
  ) {
    this.profileViewsCounter.inc({ profile_type: profileType, source });
    this.logger.debug(`Profile view recorded: ${profileId} - ${profileType} from ${source}`);
  }

  recordEnrichmentJob(
    jobType: 'description' | 'technology' | 'categorization',
    status: 'started' | 'completed' | 'failed',
    model: string = 'default',
  ) {
    this.enrichmentJobsCounter.inc({ job_type: jobType, status, model });
    this.logger.debug(`Enrichment job recorded: ${jobType} - ${status} - ${model}`);
  }

  setActiveUsers(count: number, timeWindow: '1h' | '24h' | '7d' = '24h') {
    this.activeUsersGauge.set({ time_window: timeWindow }, count);
  }

  // Performance Metrics Methods
  recordDatabaseQuery(operation: string, table: string, duration: number) {
    this.databaseQueriesTotal.inc({ operation, table });
    this.databaseQueryDuration.observe({ operation, table }, duration / 1000);
    this.logger.debug(`Database query recorded: ${operation} on ${table} - ${duration}ms`);
  }

  recordCacheHit(key: string, hit: boolean, cacheType: 'redis' | 'memory' = 'redis') {
    const result = hit ? 'hit' : 'miss';
    this.cacheHitsCounter.inc({
      operation: 'get',
      result,
      cache_type: cacheType,
    });
    this.logger.debug(`Cache ${result} recorded for key: ${key}`);
  }

  recordCacheOperation(
    operation: 'get' | 'set' | 'delete',
    cacheType: 'redis' | 'memory' = 'redis',
  ) {
    this.cacheHitsCounter.inc({
      operation,
      result: 'operation',
      cache_type: cacheType,
    });
  }

  recordQueueJob(
    queueName: string,
    jobType: string,
    status: 'started' | 'completed' | 'failed' | 'retried',
    duration?: number,
  ) {
    this.queueJobsCounter.inc({
      queue_name: queueName,
      job_type: jobType,
      status,
    });
    if (duration !== undefined) {
      this.queueJobDurationHistogram.observe(
        { queue_name: queueName, job_type: jobType },
        duration / 1000,
      );
    }
    this.logger.debug(
      `Queue job recorded: ${queueName}/${jobType} - ${status} - ${duration || 0}ms`,
    );
  }

  recordExternalAPICall(service: string, endpoint: string, statusCode: number, duration: number) {
    const status = statusCode >= 200 && statusCode < 300 ? 'success' : 'error';
    this.externalApiCallsCounter.inc({ service, endpoint, status });
    this.externalApiDurationHistogram.observe({ service, endpoint }, duration / 1000);
    this.logger.debug(
      `External API call recorded: ${service}/${endpoint} - ${statusCode} - ${duration}ms`,
    );
  }

  // Security Metrics Methods
  recordAuthAttempt(
    method: 'password' | 'github' | 'magic_link' | 'api_key',
    success: boolean,
    reason?: string,
  ) {
    const status = success ? 'success' : 'failure';
    this.authAttemptsCounter.inc({
      method,
      status,
      reason: reason || (success ? 'valid_credentials' : 'invalid_credentials'),
    });
    this.logger.debug(`Auth attempt recorded: ${method} - ${status} - ${reason || 'N/A'}`);
  }

  recordRateLimitHit(
    endpoint: string,
    userTier: string = 'free',
    limitType: 'requests' | 'bandwidth' = 'requests',
    userId?: string,
  ) {
    this.rateLimitHitsCounter.inc({
      endpoint,
      user_tier: userTier,
      limit_type: limitType,
    });
    this.logger.warn(
      `Rate limit hit: ${endpoint} - ${userTier} - ${limitType} - User: ${userId || 'anonymous'}`,
    );
  }

  recordSecurityEvent(event: SecurityEvent) {
    this.securityEventsCounter.inc({
      event_type: event.type,
      severity: event.severity,
      source: event.ip || 'unknown',
    });

    if (event.severity === 'high' || event.severity === 'critical') {
      this.suspiciousActivityCounter.inc({
        activity_type: event.type,
        severity: event.severity,
      });
    }

    this.logger.warn(`Security event recorded: ${event.type} - ${event.severity}`, {
      userId: event.userId,
      ip: event.ip,
      userAgent: event.userAgent,
      details: event.details,
    });
  }

  recordAPIKeyUsage(
    keyType: 'standard' | 'premium' | 'enterprise',
    endpoint: string,
    statusCode: number,
  ) {
    const status = statusCode >= 200 && statusCode < 300 ? 'success' : 'error';
    this.apiKeyUsageCounter.inc({ key_type: keyType, endpoint, status });
  }

  // System Health Methods
  updateSystemHealth(component: string, healthScore: number) {
    // Health score should be between 0 and 1
    const normalizedScore = Math.max(0, Math.min(1, healthScore));
    this.systemHealthGauge.set({ component }, normalizedScore);
  }

  updateErrorRate(service: string, errorRate: number, timeWindow: '1m' | '5m' | '15m' = '5m') {
    this.errorRateGauge.set({ service, time_window: timeWindow }, errorRate);
  }

  updateResponseTime(
    endpoint: string,
    avgResponseTime: number,
    timeWindow: '1m' | '5m' | '15m' = '5m',
  ) {
    this.responseTimeGauge.set({ endpoint, time_window: timeWindow }, avgResponseTime / 1000);
  }

  // Business Intelligence Methods
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    try {
      const metrics = await register.metrics();
      // Parse metrics to extract business data
      // This is a simplified implementation - in production you'd parse the actual metrics
      return {
        userSignups: 0, // Would be extracted from metrics
        projectSyncs: 0,
        apiCalls: 0,
        profileViews: 0,
        activeUsers: 0,
      };
    } catch (error) {
      this.logger.error('Failed to get business metrics', error);
      return {
        userSignups: 0,
        projectSyncs: 0,
        apiCalls: 0,
        profileViews: 0,
        activeUsers: 0,
      };
    }
  }

  private startSystemHealthTracking() {
    setInterval(() => {
      // Update overall system health based on various factors
      const memUsage = process.memoryUsage();
      const memHealthScore = 1 - memUsage.heapUsed / memUsage.heapTotal;
      this.updateSystemHealth('memory', memHealthScore);

      // CPU health (simplified)
      const cpuHealthScore = 0.8; // Would be calculated based on actual CPU usage
      this.updateSystemHealth('cpu', cpuHealthScore);

      // Overall system health
      const overallHealth = (memHealthScore + cpuHealthScore) / 2;
      this.updateSystemHealth('overall', overallHealth);
    }, 30000); // Update every 30 seconds
  }

  // Custom business metrics helpers
  createCustomCounter(name: string, help: string, labelNames: string[] = []) {
    const metricName = `gitsink_${name}`;
    try {
      // Check if metric already exists in the global registry
      const existingMetric = register.getSingleMetric(metricName);
      if (existingMetric) {
        return existingMetric as Counter;
      }
    } catch (error) {
      this.logger.error(`Error checking for existing metric ${metricName}:`, error);
      // Metric doesn't exist, which is fine - we'll create it
    }

    // Create new counter
    return new Counter({
      name: metricName,
      help,
      labelNames,
    });
  }

  createCustomHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]) {
    const metricName = `gitsink_${name}`;

    // Check if metric already exists
    const existingMetric = register.getSingleMetric(metricName);
    if (existingMetric) {
      return existingMetric as Histogram;
    }

    return new Histogram({
      name: metricName,
      help,
      labelNames,
      buckets: buckets || [0.1, 0.5, 1, 2, 5, 10],
    });
  }

  createCustomGauge(name: string, help: string, labelNames: string[] = []) {
    const metricName = `gitsink_${name}`;

    // Check if metric already exists
    const existingMetric = register.getSingleMetric(metricName);
    if (existingMetric) {
      return existingMetric as Gauge;
    }

    return new Gauge({
      name: metricName,
      help,
      labelNames,
    });
  }

  // Legacy methods - kept for backward compatibility but now use enhanced versions
  recordLegacyQueueJob(queueType: string, status: string, duration: number) {
    this.recordQueueJob('legacy', queueType, status as any, duration);
  }
}
