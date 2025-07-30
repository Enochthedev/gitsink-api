import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './utils/http-error.filter';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet, { HelmetOptions } from 'helmet';
import rateLimit from 'express-rate-limit';
import { Logger } from 'nestjs-pino';
import { ThrottleExceptionFilter } from './common/filters/throttle-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpErrorFilter());
  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : '*';
  app.enableCors({ origin: origins, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GitSink API')
    .setDescription('REST API documentation')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

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
  app.useGlobalFilters(new HttpErrorFilter(), new ThrottleExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
