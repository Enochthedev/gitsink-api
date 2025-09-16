import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

// Error handling services
import { ErrorHandlerService } from './exceptions/error-handler.service';
import { EnhancedLoggerService } from './services/enhanced-logger.service';

// Filters
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ThrottleExceptionFilter } from './filters/throttle-exception.filter';

// Pipes
import { EnhancedValidationPipe, QueryValidationPipe } from './validation/enhanced-validation.pipe';

// Interceptors
import { ErrorBoundaryInterceptor } from './interceptors/error-boundary.interceptor';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        // Core services
        ErrorHandlerService,
        EnhancedLoggerService,

        // Validation pipes
        EnhancedValidationPipe,
        QueryValidationPipe,

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
    exports: [
        ErrorHandlerService,
        EnhancedLoggerService,
        EnhancedValidationPipe,
        QueryValidationPipe,
    ],
})
export class ErrorHandlingModule { }