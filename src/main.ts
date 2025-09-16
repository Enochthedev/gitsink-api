import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './utils/http-error.filter';
import { AppModule } from './app.module';
import { EnhancedValidationPipe } from './common/validation/enhanced-validation.pipe';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet, { HelmetOptions } from 'helmet';
import rateLimit from 'express-rate-limit';
import { Logger } from 'nestjs-pino';
import { ThrottleExceptionFilter } from './common/filters/throttle-exception.filter';
import * as Sentry from '@sentry/node';
import { SentryInterceptor } from '@interceptors/sentry.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Note: Global pipes and filters are now configured in AppModule
  // This ensures proper dependency injection for enhanced error handling
  const origins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
  app.enableCors({ origin: origins, credentials: true });

  // Setup comprehensive API documentation
  const { SwaggerConfig } = await import('./common/swagger/swagger.config');
  SwaggerConfig.setup(app);

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV,
      // Http integration is automatically included in @sentry/node
      // No need to explicitly add it
    });
    app.useGlobalInterceptors(new SentryInterceptor());
  }

  if (process.env.ENABLE_HELMET !== 'false') {
    const devPolicy: HelmetOptions = { contentSecurityPolicy: false };
    const prodPolicy: HelmetOptions = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
        },
      },
    };

    const isProd = process.env.NODE_ENV === 'production';
    const policy = isProd ? prodPolicy : devPolicy;
    app.use(helmet(policy));
  }

  if (process.env.ENABLE_RATE_LIMIT !== 'false') {
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '', 10);
    const max = parseInt(process.env.RATE_LIMIT_MAX ?? '', 10);
    app.use(
      rateLimit({
        windowMs: Number.isNaN(windowMs) ? 15 * 60 * 1000 : windowMs,
        max: Number.isNaN(max) ? 100 : max,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }
  // Global filters are now configured in AppModule for proper DI

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application is running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV}`);
  logger.log(`Health check available at: http://localhost:${port}/health`);
}

void bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
