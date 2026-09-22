import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from '../../health/health.service';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface ShutdownHook {
  name: string;
  priority: number; // Lower numbers execute first
  timeout: number; // Maximum time to wait for this hook
  execute: () => Promise<void>;
}

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private readonly shutdownHooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectQueue('sync') private readonly syncQueue: Queue,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {
    this.registerDefaultHooks();
    this.setupSignalHandlers();
  }

  private registerDefaultHooks() {
    // Register default shutdown hooks in order of priority

    // 1. Stop accepting new requests (highest priority)
    this.registerHook({
      name: 'stop-accepting-requests',
      priority: 1,
      timeout: 1000,
      execute: async () => {
        this.logger.log('Stopping acceptance of new requests...');
        this.isShuttingDown = true;
      },
    });

    // 2. Finish processing active requests
    this.registerHook({
      name: 'finish-active-requests',
      priority: 2,
      timeout: 10000,
      execute: async () => {
        this.logger.log('Waiting for active requests to complete...');
        // Give active requests time to complete
        await this.waitForActiveRequests();
      },
    });

    // 3. Stop queue workers and finish active jobs
    this.registerHook({
      name: 'stop-queue-workers',
      priority: 3,
      timeout: 15000,
      execute: async () => {
        this.logger.log('Stopping queue workers...');
        await this.stopQueueWorkers();
      },
    });

    // 4. Close database connections
    this.registerHook({
      name: 'close-database',
      priority: 4,
      timeout: 5000,
      execute: async () => {
        this.logger.log('Closing database connections...');
        await this.prisma.$disconnect();
      },
    });

    // 5. Close cache connections
    this.registerHook({
      name: 'close-cache',
      priority: 5,
      timeout: 3000,
      execute: async () => {
        this.logger.log('Closing cache connections...');
        // Note: cache-manager doesn't have a standard close method
        // This would depend on the specific cache implementation
        if (typeof (this.cacheManager as any).close === 'function') {
          await (this.cacheManager as any).close();
        }
      },
    });

    // 6. Final cleanup
    this.registerHook({
      name: 'final-cleanup',
      priority: 6,
      timeout: 2000,
      execute: async () => {
        this.logger.log('Performing final cleanup...');
        // Clear any remaining timers, intervals, etc.
        if (this.shutdownTimeout) {
          clearTimeout(this.shutdownTimeout);
        }
      },
    });
  }

  registerHook(hook: ShutdownHook) {
    this.shutdownHooks.push(hook);
    this.shutdownHooks.sort((a, b) => a.priority - b.priority);
    this.logger.debug(`Registered shutdown hook: ${hook.name} (priority: ${hook.priority})`);
  }

  private setupSignalHandlers() {
    // Handle SIGTERM (Docker stop, Kubernetes termination)
    process.on('SIGTERM', () => {
      this.logger.log('Received SIGTERM signal, initiating graceful shutdown...');
      this.initiateShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.log('Received SIGINT signal, initiating graceful shutdown...');
      this.initiateShutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      this.logger.error('Uncaught exception, initiating emergency shutdown:', error);
      this.initiateShutdown('uncaughtException', true);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection, initiating emergency shutdown:', {
        reason,
        promise,
      });
      this.initiateShutdown('unhandledRejection', true);
    });
  }

  private async initiateShutdown(signal: string, emergency = false) {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress, ignoring signal:', signal);
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    this.logger.log(`Initiating ${emergency ? 'emergency ' : ''}shutdown due to: ${signal}`);

    // Set a maximum shutdown timeout
    const maxShutdownTime = emergency ? 5000 : 30000; // 5s for emergency, 30s for graceful
    this.shutdownTimeout = setTimeout(() => {
      this.logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, maxShutdownTime);

    try {
      if (emergency) {
        // For emergency shutdowns, only run critical hooks
        await this.runEmergencyShutdown();
      } else {
        // Run all shutdown hooks in order
        await this.runGracefulShutdown();
      }

      const shutdownTime = Date.now() - startTime;
      this.logger.log(`Graceful shutdown completed in ${shutdownTime}ms`);

      // Clear the timeout since we completed successfully
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }

      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  private async runGracefulShutdown() {
    for (const hook of this.shutdownHooks) {
      const startTime = Date.now();

      try {
        this.logger.debug(`Executing shutdown hook: ${hook.name}`);

        // Run the hook with its own timeout
        await Promise.race([
          hook.execute(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Hook ${hook.name} timed out`)), hook.timeout),
          ),
        ]);

        const executionTime = Date.now() - startTime;
        this.logger.debug(`Shutdown hook ${hook.name} completed in ${executionTime}ms`);
      } catch (error) {
        const executionTime = Date.now() - startTime;
        this.logger.error(`Shutdown hook ${hook.name} failed after ${executionTime}ms:`, error);

        // Continue with other hooks even if one fails
        // In production, you might want to be more strict about this
      }
    }
  }

  private async runEmergencyShutdown() {
    // Only run critical shutdown hooks for emergency shutdown
    const criticalHooks = this.shutdownHooks.filter(hook =>
      ['close-database', 'close-cache'].includes(hook.name),
    );

    for (const hook of criticalHooks) {
      try {
        this.logger.debug(`Executing emergency shutdown hook: ${hook.name}`);

        // Shorter timeout for emergency shutdown
        await Promise.race([
          hook.execute(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Emergency hook ${hook.name} timed out`)), 2000),
          ),
        ]);
      } catch (error) {
        this.logger.error(`Emergency shutdown hook ${hook.name} failed:`, error);
      }
    }
  }

  private async waitForActiveRequests() {
    // This is a simplified implementation
    // In a real application, you'd track active requests and wait for them to complete
    const maxWaitTime = 8000; // 8 seconds
    const checkInterval = 100; // 100ms
    let waitTime = 0;

    while (waitTime < maxWaitTime) {
      // Check if there are active requests
      // This would need to be implemented based on your request tracking mechanism
      const activeRequests = await this.getActiveRequestCount();

      if (activeRequests === 0) {
        this.logger.log('All active requests completed');
        return;
      }

      this.logger.debug(`Waiting for ${activeRequests} active requests to complete...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    this.logger.warn('Timeout waiting for active requests to complete');
  }

  private async getActiveRequestCount(): Promise<number> {
    // This is a placeholder implementation
    // You would need to implement actual request tracking
    // For example, using a counter that increments on request start and decrements on request end
    return 0;
  }

  private async stopQueueWorkers() {
    try {
      // Close queue connections gracefully
      await Promise.all([this.syncQueue.close(), this.emailQueue.close()]);

      this.logger.log('Queue workers stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping queue workers:', error);
      throw error;
    }
  }

  // NestJS lifecycle hook
  async onApplicationShutdown(signal?: string) {
    if (signal && !this.isShuttingDown) {
      this.logger.log(`Application shutdown hook called with signal: ${signal}`);
      await this.initiateShutdown(signal);
    }
  }

  // Public method to check if the application is shutting down
  isApplicationShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  // Public method to register custom shutdown hooks from other services
  addShutdownHook(hook: ShutdownHook) {
    this.registerHook(hook);
  }

  // Health check method
  getShutdownStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      registeredHooks: this.shutdownHooks.length,
      hooks: this.shutdownHooks.map(hook => ({
        name: hook.name,
        priority: hook.priority,
        timeout: hook.timeout,
      })),
    };
  }
}
