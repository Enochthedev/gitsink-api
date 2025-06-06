import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet, { HelmetOptions } from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({ origin: '*', credentials: true });

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
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
