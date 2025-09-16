import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service';
import { Prisma } from '@prisma/client';

export interface QueryPerformanceMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  table?: string;
  operation?: string;
  rowsAffected?: number;
}

export interface DatabaseConnectionMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  maxConnections: number;
  connectionPoolUtilization: number;
}

@Injectable()
export class DatabasePerformanceService {
  private readonly logger = new Logger(DatabasePerformanceService.name);
  private readonly slowQueryThreshold: number;
  private readonly queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();
  private readonly maxMetricsHistory = 1000;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.slowQueryThreshold = this.configService.get<number>('SLOW_QUERY_THRESHOLD_MS', 1000);
    this.setupQueryLogging();
  }

  private setupQueryLogging(): void {
    // Enable Prisma query logging for performance monitoring
    this.prismaService.$on('query' as never, (e: any) => {
      const duration = e.duration;
      const query = e.query;
      const params = e.params;

      // Record query metrics
      this.recordQueryMetrics({
        query,
        duration,
        timestamp: new Date(),
        table: this.extractTableFromQuery(query),
        operation: this.extractOperationFromQuery(query),
      });

      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        this.logger.warn(`Slow query detected (${duration}ms): ${query}`, {
          duration,
          params,
          query,
        });
      }

      // Record metrics
      this.metricsService.recordDatabaseQuery(
        this.extractOperationFromQuery(query),
        this.extractTableFromQuery(query),
        duration,
      );
    });
  }

  private recordQueryMetrics(metrics: QueryPerformanceMetrics): void {
    const queryKey = this.normalizeQuery(metrics.query);

    if (!this.queryMetrics.has(queryKey)) {
      this.queryMetrics.set(queryKey, []);
    }

    const queryHistory = this.queryMetrics.get(queryKey)!;
    queryHistory.push(metrics);

    // Keep only recent metrics to prevent memory leaks
    if (queryHistory.length > this.maxMetricsHistory) {
      queryHistory.shift();
    }
  }

  private normalizeQuery(query: string): string {
    // Normalize query by removing parameter values and whitespace
    return query
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  private extractTableFromQuery(query: string): string {
    const normalizedQuery = query.toLowerCase();

    // Extract table name from common SQL patterns
    const patterns = [
      /from\s+"?(\w+)"?/,
      /update\s+"?(\w+)"?/,
      /insert\s+into\s+"?(\w+)"?/,
      /delete\s+from\s+"?(\w+)"?/,
    ];

    for (const pattern of patterns) {
      const match = normalizedQuery.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'unknown';
  }

  private extractOperationFromQuery(query: string): string {
    const normalizedQuery = query.toLowerCase().trim();

    if (normalizedQuery.startsWith('select')) return 'select';
    if (normalizedQuery.startsWith('insert')) return 'insert';
    if (normalizedQuery.startsWith('update')) return 'update';
    if (normalizedQuery.startsWith('delete')) return 'delete';
    if (normalizedQuery.startsWith('create')) return 'create';
    if (normalizedQuery.startsWith('alter')) return 'alter';
    if (normalizedQuery.startsWith('drop')) return 'drop';

    return 'other';
  }

  async getSlowQueries(limit = 50): Promise<QueryPerformanceMetrics[]> {
    const allMetrics: QueryPerformanceMetrics[] = [];

    for (const metrics of this.queryMetrics.values()) {
      allMetrics.push(...metrics);
    }

    return allMetrics
      .filter(m => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  async getQueryStatistics(timeWindow = 3600000): Promise<any> {
    const cutoffTime = new Date(Date.now() - timeWindow);
    const stats = new Map<
      string,
      {
        count: number;
        totalDuration: number;
        avgDuration: number;
        maxDuration: number;
        minDuration: number;
      }
    >();

    for (const [queryKey, metrics] of this.queryMetrics.entries()) {
      const recentMetrics = metrics.filter(m => m.timestamp > cutoffTime);

      if (recentMetrics.length === 0) continue;

      const durations = recentMetrics.map(m => m.duration);
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);

      stats.set(queryKey, {
        count: recentMetrics.length,
        totalDuration,
        avgDuration: totalDuration / recentMetrics.length,
        maxDuration: Math.max(...durations),
        minDuration: Math.min(...durations),
      });
    }

    return Object.fromEntries(stats);
  }

  async getDatabaseConnectionMetrics(): Promise<DatabaseConnectionMetrics> {
    try {
      // Get connection pool information from Prisma
      const connectionInfo = await this.prismaService.$queryRaw<
        Array<{
          state: string;
          count: bigint;
        }>
      >`
        SELECT state, COUNT(*) as count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `;

      let activeConnections = 0;
      let idleConnections = 0;
      let totalConnections = 0;

      for (const info of connectionInfo) {
        const count = Number(info.count);
        totalConnections += count;

        if (info.state === 'active') {
          activeConnections = count;
        } else if (info.state === 'idle') {
          idleConnections = count;
        }
      }

      // Get max connections setting
      const maxConnectionsResult = await this.prismaService.$queryRaw<
        Array<{
          setting: string;
        }>
      >`SHOW max_connections`;

      const maxConnections = parseInt(maxConnectionsResult[0]?.setting || '100');
      const connectionPoolUtilization = (totalConnections / maxConnections) * 100;

      return {
        activeConnections,
        idleConnections,
        totalConnections,
        maxConnections,
        connectionPoolUtilization,
      };
    } catch (error) {
      this.logger.error('Failed to get database connection metrics', error);
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 0,
        connectionPoolUtilization: 0,
      };
    }
  }

  async optimizeQuery(query: string): Promise<string[]> {
    const suggestions: string[] = [];
    const normalizedQuery = query.toLowerCase();

    // Check for missing indexes
    if (normalizedQuery.includes('where') && !normalizedQuery.includes('index')) {
      suggestions.push('Consider adding indexes on WHERE clause columns');
    }

    // Check for SELECT *
    if (normalizedQuery.includes('select *')) {
      suggestions.push('Avoid SELECT * - specify only needed columns');
    }

    // Check for N+1 queries
    if (normalizedQuery.includes('in (')) {
      suggestions.push('Consider using JOIN instead of IN clause for better performance');
    }

    // Check for LIKE with leading wildcard
    if (normalizedQuery.includes("like '%")) {
      suggestions.push(
        'LIKE with leading wildcard prevents index usage - consider full-text search',
      );
    }

    // Check for ORDER BY without LIMIT
    if (normalizedQuery.includes('order by') && !normalizedQuery.includes('limit')) {
      suggestions.push('ORDER BY without LIMIT can be expensive - consider pagination');
    }

    return suggestions;
  }

  async analyzeTablePerformance(): Promise<any> {
    try {
      const tableStats = await this.prismaService.$queryRaw<
        Array<{
          schemaname: string;
          tablename: string;
          seq_scan: bigint;
          seq_tup_read: bigint;
          idx_scan: bigint;
          idx_tup_fetch: bigint;
          n_tup_ins: bigint;
          n_tup_upd: bigint;
          n_tup_del: bigint;
        }>
      >`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          idx_tup_fetch,
          n_tup_ins,
          n_tup_upd,
          n_tup_del
        FROM pg_stat_user_tables
        ORDER BY seq_scan DESC
      `;

      return tableStats.map(stat => ({
        schema: stat.schemaname,
        table: stat.tablename,
        sequentialScans: Number(stat.seq_scan),
        sequentialTuplesRead: Number(stat.seq_tup_read),
        indexScans: Number(stat.idx_scan),
        indexTuplesFetched: Number(stat.idx_tup_fetch),
        insertsCount: Number(stat.n_tup_ins),
        updatesCount: Number(stat.n_tup_upd),
        deletesCount: Number(stat.n_tup_del),
        indexUsageRatio:
          stat.idx_scan && stat.seq_scan
            ? Number(stat.idx_scan) / (Number(stat.idx_scan) + Number(stat.seq_scan))
            : 0,
      }));
    } catch (error) {
      this.logger.error('Failed to analyze table performance', error);
      return [];
    }
  }

  async getIndexUsageStats(): Promise<any> {
    try {
      const indexStats = await this.prismaService.$queryRaw<
        Array<{
          schemaname: string;
          tablename: string;
          indexname: string;
          idx_scan: bigint;
          idx_tup_read: bigint;
          idx_tup_fetch: bigint;
        }>
      >`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
      `;

      return indexStats.map(stat => ({
        schema: stat.schemaname,
        table: stat.tablename,
        index: stat.indexname,
        scans: Number(stat.idx_scan),
        tuplesRead: Number(stat.idx_tup_read),
        tuplesFetched: Number(stat.idx_tup_fetch),
      }));
    } catch (error) {
      this.logger.error('Failed to get index usage stats', error);
      return [];
    }
  }

  async suggestIndexes(): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // Find tables with high sequential scan ratios
      const tableStats = await this.analyzeTablePerformance();

      for (const stat of tableStats) {
        if (stat.indexUsageRatio < 0.1 && stat.sequentialScans > 100) {
          suggestions.push(
            `Table "${stat.table}" has low index usage ratio (${(stat.indexUsageRatio * 100).toFixed(1)}%) - consider adding indexes`,
          );
        }
      }

      // Analyze slow queries for index suggestions
      const slowQueries = await this.getSlowQueries(20);
      const queryPatterns = new Set<string>();

      for (const query of slowQueries) {
        const table = query.table;
        if (table && table !== 'unknown') {
          // Extract WHERE clause patterns
          const whereMatch = query.query.match(/where\s+(.+?)(?:\s+order|\s+group|\s+limit|$)/i);
          if (whereMatch) {
            const whereClause = whereMatch[1];
            const columns = this.extractColumnsFromWhereClause(whereClause);

            for (const column of columns) {
              const indexSuggestion = `CREATE INDEX CONCURRENTLY "idx_${table}_${column}" ON "${table}" ("${column}")`;
              queryPatterns.add(indexSuggestion);
            }
          }
        }
      }

      suggestions.push(...Array.from(queryPatterns));
    } catch (error) {
      this.logger.error('Failed to suggest indexes', error);
    }

    return suggestions;
  }

  private extractColumnsFromWhereClause(whereClause: string): string[] {
    const columns: string[] = [];

    // Simple pattern matching for column names in WHERE clauses
    const columnPatterns = [
      /"?(\w+)"?\s*=/, // column = value
      /"?(\w+)"?\s*>/, // column > value
      /"?(\w+)"?\s*</, // column < value
      /"?(\w+)"?\s*in\s*\(/, // column IN (...)
      /"?(\w+)"?\s*like/, // column LIKE
    ];

    for (const pattern of columnPatterns) {
      const matches = whereClause.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        if (match[1] && !columns.includes(match[1])) {
          columns.push(match[1]);
        }
      }
    }

    return columns;
  }

  async resetMetrics(): Promise<void> {
    this.queryMetrics.clear();
    this.logger.log('Query performance metrics reset');
  }
}
