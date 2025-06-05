import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.ENABLE_HELMET !== 'false') {
    app.use(helmet());
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
