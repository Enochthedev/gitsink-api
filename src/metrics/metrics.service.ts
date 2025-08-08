import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge, register } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
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
    this.startMemoryUsageTracking();
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

  recordDatabaseQueryDuration(
    operation: string,
    duration: number,
    table?: string,
  ) {
    this.databaseQueryDuration.observe(
      { operation, table: table || 'unknown' },
      duration,
    );
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
      console.error(`Error checking for existing metric ${metricName}:`, error);
      // Metric doesn't exist, which is fine - we'll create it
    }

    // Create new counter
    return new Counter({
      name: metricName,
      help,
      labelNames,
    });
  }

  createCustomHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[],
  ) {
    return new Histogram({
      name: `gitsink_${name}`,
      help,
      labelNames,
      buckets: buckets || [0.1, 0.5, 1, 2, 5, 10],
    });
  }

  createCustomGauge(name: string, help: string, labelNames: string[] = []) {
    return new Gauge({
      name: `gitsink_${name}`,
      help,
      labelNames,
    });
  }
}
