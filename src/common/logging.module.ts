import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggingService } from './services/logging.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { LoggerMiddleware } from './middleware/logger.middleware';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LoggingService, LoggingInterceptor, LoggerMiddleware],
  exports: [LoggingService, LoggingInterceptor, LoggerMiddleware],
})
export class LoggingModule {}
