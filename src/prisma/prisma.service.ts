import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const connectionLimit = configService.get<number>('DATABASE_CONNECTION_LIMIT', 20);
    const connectionTimeout = configService.get<number>('DATABASE_CONNECTION_TIMEOUT', 30000);
    const poolTimeout = configService.get<number>('DATABASE_POOL_TIMEOUT', 30000);
    const statementTimeout = configService.get<number>('DATABASE_STATEMENT_TIMEOUT', 60000);
    const queryTimeout = configService.get<number>('DATABASE_QUERY_TIMEOUT', 30000);

    // Build optimized database URL with connection pool parameters
    const baseUrl = configService.get<string>('DATABASE_URL');
    const urlParams = new URLSearchParams();
    urlParams.set('connection_limit', connectionLimit.toString());
    urlParams.set('pool_timeout', Math.floor(poolTimeout / 1000).toString());
    urlParams.set('connect_timeout', Math.floor(connectionTimeout / 1000).toString());
    urlParams.set('statement_timeout', Math.floor(statementTimeout / 1000).toString());
    urlParams.set('query_timeout', Math.floor(queryTimeout / 1000).toString());
    urlParams.set('pgbouncer', 'true'); // Enable connection pooling optimizations
    urlParams.set('schema_cache', 'true'); // Enable schema caching

    if (!baseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    const optimizedUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${urlParams.toString()}`;

    super({
      datasources: {
        db: {
          url: optimizedUrl,
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
      ],
      errorFormat: 'pretty',
      // Enhanced Prisma client options for performance
      transactionOptions: {
        maxWait: 5000, // 5 seconds max wait for transaction
        timeout: 30000, // 30 seconds transaction timeout
        isolationLevel: 'ReadCommitted', // Optimal for most use cases
      },
    });

    // Configure query logging and performance monitoring
    (this as any).$on('query', (e: any) => {
      const duration = e.duration;
      if (duration > 1000) {
        this.logger.warn(`Slow query detected: ${e.query} (${duration}ms)`, {
          query: e.query,
          params: e.params,
          duration,
          target: e.target,
        });
      } else if (duration > 500) {
        this.logger.debug(`Query performance warning: ${e.query} (${duration}ms)`, {
          query: e.query.substring(0, 100) + '...',
          duration,
        });
      }
    });

    // Log connection errors
    (this as any).$on('error', (e: any) => {
      this.logger.error('Database error occurred', {
        error: e.message,
        target: e.target,
        timestamp: new Date().toISOString(),
      });
    });

    this.logger.log(`Database connection pool configured with enhanced settings`, {
      connectionLimit,
      connectionTimeout,
      poolTimeout,
      statementTimeout,
      queryTimeout,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established successfully');

      // Test the connection
      await this.$queryRaw`SELECT 1`;
      this.logger.log('Database connection test successful');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('Database connection closed successfully');
    } catch (error) {
      this.logger.error('Error closing database connection', error);
    }
  }

  /**
   * Execute a query with performance monitoring
   */
  async executeWithMetrics<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      if (duration > 1000) {
        this.logger.warn(`Slow operation detected: ${operationName} took ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Operation failed: ${operationName} after ${duration}ms`, error);
      throw error;
    }
  }

  /**
   * Get database health information
   */
  async getHealthInfo(): Promise<{
    isConnected: boolean;
    connectionCount: number;
    version: string;
  }> {
    try {
      // Test basic connectivity
      await this.$queryRaw`SELECT 1`;

      // Get connection count
      const connectionResult = await this.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;

      // Get PostgreSQL version
      const versionResult = await this.$queryRaw<Array<{ version: string }>>`
        SELECT version()
      `;

      return {
        isConnected: true,
        connectionCount: Number(connectionResult[0]?.count || 0),
        version: versionResult[0]?.version || 'unknown',
      };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return {
        isConnected: false,
        connectionCount: 0,
        version: 'unknown',
      };
    }
  }

  /**
   * Execute a transaction with retry logic and enhanced error handling
   */
  async executeTransaction<T>(
    operation: (tx: any) => Promise<T>,
    options: {
      maxRetries?: number;
      timeout?: number;
      isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
    } = {},
  ): Promise<T> {
    const { maxRetries = 3, timeout = 30000, isolationLevel = 'ReadCommitted' } = options;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(operation, {
          timeout,
          isolationLevel,
        });
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable (deadlock, serialization failure, etc.)
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          this.logger.error(`Transaction failed after ${attempt} attempts`, {
            error: error instanceof Error ? error.message : String(error),
            attempt,
            maxRetries,
            isRetryable,
          });
          throw error;
        }

        // Exponential backoff with jitter
        const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        const delay = baseDelay + jitter;

        this.logger.warn(
          `Transaction attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`,
          {
            error: error instanceof Error ? error.message : String(error),
            attempt,
            delay: Math.round(delay),
          },
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Soft delete helper - marks record as deleted instead of removing it
   */
  async softDelete(model: string, where: any): Promise<any> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    return modelDelegate.update({
      where,
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Soft delete many records
   */
  async softDeleteMany(model: string, where: any): Promise<{ count: number }> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    return modelDelegate.updateMany({
      where,
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Restore soft deleted record
   */
  async restore(model: string, where: any): Promise<any> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    return modelDelegate.update({
      where,
      data: {
        deletedAt: null,
      },
    });
  }

  /**
   * Find many with automatic soft delete filtering
   */
  async findManyActive(model: string, args: any = {}): Promise<any[]> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    return modelDelegate.findMany({
      ...args,
      where: {
        ...args.where,
        deletedAt: null,
      },
    });
  }

  /**
   * Count active (non-deleted) records
   */
  async countActive(model: string, where: any = {}): Promise<number> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    return modelDelegate.count({
      where: {
        ...where,
        deletedAt: null,
      },
    });
  }

  /**
   * Batch operations with optimized performance
   */
  async batchCreate(model: string, data: any[], batchSize = 1000): Promise<{ count: number }> {
    const modelDelegate = (this as any)[model];
    if (!modelDelegate) {
      throw new Error(`Model ${model} not found`);
    }

    let totalCount = 0;

    // Process in batches to avoid memory issues and connection timeouts
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const result = await modelDelegate.createMany({
        data: batch,
        skipDuplicates: true, // Skip duplicates to avoid errors
      });
      totalCount += result.count;
    }

    return { count: totalCount };
  }

  /**
   * Optimized bulk upsert operation
   */
  async bulkUpsert(
    model: string,
    records: Array<{ where: any; create: any; update: any }>,
    batchSize = 100,
  ): Promise<any[]> {
    const results: any[] = [];

    // Process in batches to avoid overwhelming the database
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const batchResults = await this.executeTransaction(async tx => {
        const promises = batch.map(record => {
          const modelDelegate = tx[model];
          return modelDelegate.upsert(record);
        });
        return Promise.all(promises);
      });

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Connection pool monitoring
   */
  async getConnectionPoolStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    maxConnections: number;
  }> {
    try {
      const result = await this.$queryRaw<
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

      const stats = result.reduce(
        (acc, row) => {
          const count = Number(row.count);
          switch (row.state) {
            case 'active':
              acc.activeConnections = count;
              break;
            case 'idle':
              acc.idleConnections = count;
              break;
          }
          acc.totalConnections += count;
          return acc;
        },
        {
          activeConnections: 0,
          idleConnections: 0,
          totalConnections: 0,
          maxConnections: this.configService.get<number>('DATABASE_CONNECTION_LIMIT', 20),
        },
      );

      return stats;
    } catch (error) {
      this.logger.error('Failed to get connection pool stats', error);
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 0,
      };
    }
  }

  /**
   * Database performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    slowQueries: number;
    avgQueryTime: number;
    cacheHitRatio: number;
    indexUsage: number;
  }> {
    try {
      const [slowQueriesResult, cacheStatsResult, indexStatsResult] = await Promise.all([
        // Get slow queries count (queries taking more than 1 second)
        this.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count
          FROM pg_stat_statements 
          WHERE mean_exec_time > 1000
        `.catch(() => [{ count: BigInt(0) }]),

        // Get cache hit ratio
        this.$queryRaw<
          Array<{
            heap_blks_read: bigint;
            heap_blks_hit: bigint;
          }>
        >`
          SELECT 
            SUM(heap_blks_read) as heap_blks_read,
            SUM(heap_blks_hit) as heap_blks_hit
          FROM pg_statio_user_tables
        `,

        // Get index usage statistics
        this.$queryRaw<
          Array<{
            idx_scan: bigint;
            seq_scan: bigint;
          }>
        >`
          SELECT 
            SUM(idx_scan) as idx_scan,
            SUM(seq_scan) as seq_scan
          FROM pg_stat_user_tables
        `,
      ]);

      const slowQueries = Number(slowQueriesResult[0]?.count || 0);

      const heapRead = Number(cacheStatsResult[0]?.heap_blks_read || 0);
      const heapHit = Number(cacheStatsResult[0]?.heap_blks_hit || 0);
      const cacheHitRatio = heapRead + heapHit > 0 ? (heapHit / (heapRead + heapHit)) * 100 : 0;

      const idxScan = Number(indexStatsResult[0]?.idx_scan || 0);
      const seqScan = Number(indexStatsResult[0]?.seq_scan || 0);
      const indexUsage = idxScan + seqScan > 0 ? (idxScan / (idxScan + seqScan)) * 100 : 0;

      return {
        slowQueries,
        avgQueryTime: 0, // Would need pg_stat_statements extension for accurate data
        cacheHitRatio,
        indexUsage,
      };
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error);
      return {
        slowQueries: 0,
        avgQueryTime: 0,
        cacheHitRatio: 0,
        indexUsage: 0,
      };
    }
  }

  private isRetryableError(error: any): boolean {
    if (!error?.code) return false;

    // PostgreSQL error codes that are typically retryable
    const retryableCodes = [
      '40001', // serialization_failure
      '40P01', // deadlock_detected
      '53300', // too_many_connections
      '08006', // connection_failure
      '08001', // sqlclient_unable_to_establish_sqlconnection
    ];

    return retryableCodes.includes(error.code);
  }
}
