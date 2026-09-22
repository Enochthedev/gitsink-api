import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const metricsProviders = [
  // Core HTTP Metrics
  makeCounterProvider({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),
  makeHistogramProvider({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  }),
  makeGaugeProvider({
    name: 'active_connections',
    help: 'Number of active connections',
  }),

  // Database Metrics
  makeCounterProvider({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table'],
  }),
  makeHistogramProvider({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  // System Metrics
  makeGaugeProvider({
    name: 'memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['type'],
  }),

  // Business Metrics
  makeCounterProvider({
    name: 'gitsink_user_signups_total',
    help: 'Total number of user signups',
    labelNames: ['method', 'source'],
  }),
  makeCounterProvider({
    name: 'gitsink_project_syncs_total',
    help: 'Total number of project syncs',
    labelNames: ['platform', 'status', 'user_tier'],
  }),
  makeCounterProvider({
    name: 'gitsink_api_calls_total',
    help: 'Total number of API calls',
    labelNames: ['endpoint', 'method', 'user_tier', 'api_key_type'],
  }),
  makeCounterProvider({
    name: 'gitsink_profile_views_total',
    help: 'Total number of profile views',
    labelNames: ['profile_type', 'source'],
  }),
  makeGaugeProvider({
    name: 'gitsink_active_users',
    help: 'Number of active users',
    labelNames: ['time_window'],
  }),
  makeHistogramProvider({
    name: 'gitsink_sync_duration_seconds',
    help: 'Duration of sync operations',
    labelNames: ['platform', 'operation_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  }),
  makeCounterProvider({
    name: 'gitsink_enrichment_jobs_total',
    help: 'Total number of AI enrichment jobs',
    labelNames: ['job_type', 'status', 'model'],
  }),

  // Performance Metrics
  makeCounterProvider({
    name: 'gitsink_cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'result', 'cache_type'],
  }),
  makeCounterProvider({
    name: 'gitsink_queue_jobs_total',
    help: 'Total number of queue jobs',
    labelNames: ['queue_name', 'job_type', 'status'],
  }),
  makeHistogramProvider({
    name: 'gitsink_queue_job_duration_seconds',
    help: 'Duration of queue job processing',
    labelNames: ['queue_name', 'job_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
  }),
  makeCounterProvider({
    name: 'gitsink_external_api_calls_total',
    help: 'Total number of external API calls',
    labelNames: ['service', 'endpoint', 'status'],
  }),
  makeHistogramProvider({
    name: 'gitsink_external_api_duration_seconds',
    help: 'Duration of external API calls',
    labelNames: ['service', 'endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  }),

  // Security Metrics
  makeCounterProvider({
    name: 'gitsink_auth_attempts_total',
    help: 'Total number of authentication attempts',
    labelNames: ['method', 'status', 'reason'],
  }),
  makeCounterProvider({
    name: 'gitsink_rate_limit_hits_total',
    help: 'Total number of rate limit hits',
    labelNames: ['endpoint', 'user_tier', 'limit_type'],
  }),
  makeCounterProvider({
    name: 'gitsink_security_events_total',
    help: 'Total number of security events',
    labelNames: ['event_type', 'severity', 'source'],
  }),
  makeCounterProvider({
    name: 'gitsink_api_key_usage_total',
    help: 'Total API key usage',
    labelNames: ['key_type', 'endpoint', 'status'],
  }),
  makeCounterProvider({
    name: 'gitsink_suspicious_activity_total',
    help: 'Total suspicious activity events',
    labelNames: ['activity_type', 'severity'],
  }),

  // System Health Metrics
  makeGaugeProvider({
    name: 'gitsink_system_health_score',
    help: 'Overall system health score (0-1)',
    labelNames: ['component'],
  }),
  makeGaugeProvider({
    name: 'gitsink_error_rate',
    help: 'Current error rate percentage',
    labelNames: ['service', 'time_window'],
  }),
  makeGaugeProvider({
    name: 'gitsink_avg_response_time_seconds',
    help: 'Average response time in seconds',
    labelNames: ['endpoint', 'time_window'],
  }),
];
