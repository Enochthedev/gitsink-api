import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ParserModule } from './parser/parser.module';
import { ProjectsModule } from './projects/projects.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { PlatformsModule } from './platforms/platforms.module';
import { AIEnrichmentModule } from './ai-enrichment/ai-enrichment.module';
import { ProfilesModule } from './profiles/profiles.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { UserContextGuard } from './auth/user-context.guard';
import { Request, Response } from 'express';
import { LoggerModule } from 'nestjs-pino';
import { QueuesModule } from './queues/queues.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { RequestContextMiddleware, UserContextMiddleware, PerformanceTrackingMiddleware } from './common/middleware/request-context.middleware';
import { LoggingModule } from './common/logging.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import { ThrottleExceptionFilter } from './common/filters/throttle-exception.filter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ErrorHandlerService } from './common/exceptions/error-handler.service';
import { EnhancedValidationPipe } from './common/validation/enhanced-validation.pipe';
import { ErrorBoundaryInterceptor } from './common/interceptors/error-boundary.interceptor';
import { EnhancedLoggerService } from './common/services/enhanced-logger.service';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuditModule } from './audit/audit.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { SecurityModule } from './common/security.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigValidationService } from './common/config/config-validation.service';
import { GracefulShutdownService } from './common/services/graceful-shutdown.service';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { BillingModule } from './billing/billing.module';


@Module({
  imports: [
    ConfigModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        maxRetriesPerRequest: null, // Critical: BullMQ requires this to be null
        lazyConnect: true,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
      },
    }),
    BullModule.registerQueue(
      { name: 'sync' },
      { name: 'email' }
    ),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 1000, // 1 second
          limit: 3,
        },
        {
          name: 'medium',
          ttl: 10000, // 10 seconds
          limit: 20,
        },
        {
          name: 'long',
          ttl: 60000, // 1 minute
          limit: 100,
        },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        store: redisStore,
        url: process.env.REDIS_URL,
        ttl: 300, // default TTL
      }),
    }),
    ScheduleModule.forRoot(),
    ParserModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
      csrfPrevention: false,
      // Enable subscriptions
      subscriptions: {
        'graphql-ws': true,
        'subscriptions-transport-ws': true,
      },
      // Explicitly type the request context for better safety
      context: ({ req, res, connection }: { req?: Request; res?: Response; connection?: any }) => {
        if (connection) {
          // For subscriptions
          return {
            req: connection.context.req,
            userId: connection.context.userId,
          };
        }
        // For queries and mutations
        return {
          req,
          res,
        };
      },
    }),
    ProjectsModule,
    PrismaModule,
    AuthModule,
    MailModule,
    WaitlistModule,
    PlatformsModule,
    AIEnrichmentModule,
    ProfilesModule,
    QueuesModule,
    HealthModule,
    MetricsModule,
    AuditModule,
    WebhooksModule,
    SandboxModule,
    SecurityModule,
    LoggingModule,
    ApiKeysModule,
    SubscriptionsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    UserContextGuard,
    ErrorHandlerService,
    EnhancedLoggerService,
    ConfigValidationService,
    GracefulShutdownService,
    // Apply GqlThrottlerGuard globally (supports both HTTP and GraphQL contexts)
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    // Apply UserContextGuard globally (but with lower priority)
    {
      provide: APP_GUARD,
      useClass: UserContextGuard,
    },
    // Global exception filters (order matters - more specific first)
    {
      provide: APP_FILTER,
      useClass: ThrottleExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global validation pipe
    {
      provide: APP_PIPE,
      useClass: EnhancedValidationPipe,
    },
    // Global error boundary interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorBoundaryInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestContextMiddleware,
        UserContextMiddleware,
        PerformanceTrackingMiddleware,
        SecurityMiddleware,
        LoggerMiddleware
      )
      .forRoutes('*');
  }
}
