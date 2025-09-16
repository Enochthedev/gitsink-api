# Enhanced Error Handling and Validation System

This directory contains a comprehensive error handling and validation system for the Gitsink API. The system provides standardized error handling, enhanced validation, structured logging, and error boundaries throughout the application.

## Features

### 1. Standardized Error Handling
- **AppError**: Base error class with consistent structure
- **Specialized Error Types**: ValidationError, AuthenticationError, ExternalServiceError, etc.
- **Error Categories**: Systematic categorization for better error management
- **Automatic Error Conversion**: Converts framework-specific errors to standardized format

### 2. Enhanced Validation
- **Custom Validation Decorators**: Business-specific validation rules
- **Enhanced Validation Pipe**: Detailed error messages with field-level information
- **Query Parameter Validation**: Specialized validation for URL parameters
- **File Upload Validation**: Size, type, and extension validation

### 3. Error Boundaries
- **Method-Level Protection**: Decorators for automatic error handling
- **Retry Logic**: Configurable retry mechanisms with exponential backoff
- **Fallback Functions**: Graceful degradation when errors occur
- **Context-Aware Handling**: Different strategies for different error types

### 4. Structured Logging
- **Enhanced Logger Service**: Structured logging with context
- **Performance Tracking**: Automatic performance metrics collection
- **Security Event Logging**: Threat detection and security monitoring
- **Request Context**: Automatic request ID and correlation tracking

### 5. Middleware Integration
- **Request Context**: Automatic request ID generation and tracking
- **Performance Monitoring**: Response time and resource usage tracking
- **Security Monitoring**: Threat detection and suspicious activity logging
- **User Context**: Automatic user information extraction

## Usage Examples

### Basic Error Handling

```typescript
import { ValidationError, ExternalServiceError } from '@common/exceptions/app-error';

// Throw standardized errors
throw new ValidationError('Invalid email format', { field: 'email' });
throw new ExternalServiceError('GitHub API unavailable', 'github', { status: 503 });
```

### Custom Validation Decorators

```typescript
import { IsGitHubRepoUrl, IsValidUsername, IsStrongPassword } from '@common/validation/validation.decorators';

class CreateProjectDto {
  @IsGitHubRepoUrl()
  repoUrl: string;

  @IsValidUsername()
  username: string;

  @IsStrongPassword()
  password: string;
}
```

### Error Boundaries

```typescript
import { DatabaseErrorBoundary, ExternalServiceErrorBoundary } from '@common/decorators/error-boundary.decorator';

class ProjectService {
  @DatabaseErrorBoundary(null)
  async findProject(id: string) {
    // Database operation with automatic error handling
    return this.prisma.project.findUnique({ where: { id } });
  }

  @ExternalServiceErrorBoundary('github', { repositories: [] })
  async fetchGitHubRepos(token: string) {
    // External service call with fallback
    return this.githubApi.getRepositories(token);
  }
}
```

### Enhanced Logging

```typescript
import { EnhancedLoggerService } from '@common/services/enhanced-logger.service';

class MyService {
  constructor(private logger: EnhancedLoggerService) {}

  async processData(userId: string) {
    const childLogger = this.logger.createChildLogger({ userId });
    
    try {
      childLogger.logBusinessEvent('data_processing_started', 'user', userId);
      // Process data...
      childLogger.logBusinessEvent('data_processing_completed', 'user', userId);
    } catch (error) {
      childLogger.logError(error);
      throw error;
    }
  }
}
```

## Error Types

### AppError (Base Class)
- **Properties**: code, category, message, statusCode, retryable, timestamp, requestId, userId
- **Methods**: toJSON(), getStatus()

### Specialized Error Classes
- **ValidationError**: Input validation failures (400)
- **AuthenticationError**: Authentication failures (401)
- **AuthorizationError**: Authorization failures (403)
- **ExternalServiceError**: External API failures (502)
- **DatabaseError**: Database operation failures (500)
- **BusinessLogicError**: Business rule violations (422)
- **RateLimitError**: Rate limit exceeded (429)
- **ConfigurationError**: Configuration issues (500)

## Error Categories

- **AUTHENTICATION**: Authentication-related errors
- **AUTHORIZATION**: Authorization-related errors
- **VALIDATION**: Input validation errors
- **EXTERNAL_SERVICE**: External API errors
- **DATABASE**: Database operation errors
- **RATE_LIMIT**: Rate limiting errors
- **SYSTEM**: System-level errors
- **BUSINESS_LOGIC**: Business rule violations
- **NETWORK**: Network connectivity errors
- **CONFIGURATION**: Configuration errors

## Validation Decorators

### Built-in Decorators
- **@IsGitHubRepoUrl()**: Validates GitHub repository URLs
- **@IsValidUsername()**: Validates username format (3-30 chars, alphanumeric + underscore/hyphen)
- **@IsStrongPassword()**: Validates password strength (8+ chars, mixed case, numbers, symbols)
- **@IsApiKeyFormat()**: Validates API key format (gsk_[64 chars])
- **@IsHexColor()**: Validates hex color codes (#FF0000 or #F00)
- **@IsSlug()**: Validates URL-friendly slugs
- **@IsUniqueArray()**: Ensures array values are unique
- **@IsInRange(min, max)**: Validates numeric ranges
- **@IsOneOfIgnoreCase(values)**: Case-insensitive enum validation

### Usage in DTOs

```typescript
class ProjectDto {
  @IsGitHubRepoUrl()
  repoUrl: string;

  @IsValidUsername()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsHexColor()
  @IsOptional()
  themeColor?: string;

  @IsUniqueArray()
  @IsString({ each: true })
  tags: string[];
}
```

## Error Boundary Decorators

### Available Decorators
- **@ErrorBoundary(options)**: Generic error boundary with custom options
- **@DatabaseErrorBoundary(fallback)**: Specialized for database operations
- **@ExternalServiceErrorBoundary(service, fallback)**: For external API calls
- **@ValidationErrorBoundary(message)**: For validation operations
- **@AuthErrorBoundary()**: For authentication operations
- **@BusinessLogicErrorBoundary(fallback)**: For business logic operations

### Configuration Options

```typescript
interface ErrorBoundaryOptions {
  fallback?: (error: Error, ...args: any[]) => any;
  retry?: {
    attempts: number;
    delay: number;
    exponentialBackoff?: boolean;
  };
  handleCategories?: ErrorCategory[];
  logErrors?: boolean;
  customMessage?: string;
  context?: string;
  suppressError?: boolean;
}
```

## Logging Features

### Log Types
- **Error Logging**: Structured error information with context
- **Performance Logging**: Response times, memory usage, CPU metrics
- **Security Logging**: Threat detection, authentication events
- **API Request Logging**: Request/response tracking with timing
- **Database Operation Logging**: Query performance monitoring
- **External Service Logging**: API call tracking and failure detection
- **Business Event Logging**: Domain-specific event tracking
- **Queue Operation Logging**: Background job monitoring

### Log Context

```typescript
interface LogContext {
  requestId?: string;
  userId?: string;
  correlationId?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, any>;
}
```

## Middleware Components

### RequestContextMiddleware
- Generates unique request IDs
- Tracks request timing
- Sets response headers
- Logs request/response information

### UserContextMiddleware
- Extracts user information from JWT tokens
- Validates authentication
- Logs authentication events

### PerformanceTrackingMiddleware
- Monitors CPU and memory usage
- Tracks slow requests (>1s)
- Logs performance metrics

### SecurityMiddleware
- Detects suspicious patterns in requests
- Monitors for potential security threats
- Logs security events with severity levels

## Configuration

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=info
ENABLE_STRUCTURED_LOGGING=true
ENABLE_PERFORMANCE_LOGGING=true
ENABLE_SECURITY_LOGGING=true

# Error Handling
NODE_ENV=production
SENTRY_DSN=your-sentry-dsn
```

### Module Integration

```typescript
import { ErrorHandlingModule } from '@common/error-handling.module';

@Module({
  imports: [
    ErrorHandlingModule, // Provides global error handling
    // ... other modules
  ],
})
export class AppModule {}
```

## Testing

The error handling system includes comprehensive tests:

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end error handling flows
- **Validation Tests**: Custom decorator validation
- **Performance Tests**: Error handling performance impact

### Running Tests

```bash
# Run all error handling tests
npm test -- --testPathPattern="error-handler|validation|exception"

# Run specific test suites
npm test -- --testPathPattern="error-handler.service.spec.ts"
npm test -- --testPathPattern="validation.decorators.spec.ts"
```

## Best Practices

### Error Handling
1. **Use Specific Error Types**: Choose the most appropriate error class
2. **Include Context**: Provide relevant details in error objects
3. **Log Appropriately**: Use structured logging with proper levels
4. **Handle Retries**: Use error boundaries for retryable operations
5. **Sanitize Responses**: Don't expose sensitive information in production

### Validation
1. **Validate Early**: Use DTOs for all input validation
2. **Provide Clear Messages**: Use descriptive validation error messages
3. **Use Custom Decorators**: Leverage business-specific validation rules
4. **Validate Consistently**: Apply the same validation rules across endpoints

### Logging
1. **Use Structured Logs**: Include context and metadata
2. **Log Security Events**: Monitor for threats and suspicious activity
3. **Track Performance**: Monitor slow operations and resource usage
4. **Correlate Requests**: Use request IDs for tracing across services

### Error Boundaries
1. **Use Appropriate Boundaries**: Choose the right decorator for the operation
2. **Provide Fallbacks**: Implement graceful degradation
3. **Configure Retries**: Set appropriate retry policies
4. **Monitor Failures**: Track error boundary activations

## Troubleshooting

### Common Issues

1. **Validation Not Working**: Ensure DTOs are properly decorated and ValidationPipe is configured
2. **Errors Not Logged**: Check logger configuration and error boundary setup
3. **Retries Not Working**: Verify error is marked as retryable and retry configuration
4. **Context Missing**: Ensure middleware is properly configured in the correct order

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
LOG_LEVEL=debug npm start
```

This will provide detailed information about error handling, validation, and logging operations.