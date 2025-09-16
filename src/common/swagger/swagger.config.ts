import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export class SwaggerConfig {
  static setup(app: INestApplication): void {
    const config = new DocumentBuilder()
      .setTitle('GitSink API')
      .setDescription(
        `
# GitSink API Documentation

GitSink is an API-first backend service that helps developers sync, enrich, and showcase their GitHub repositories. 
The system serves as a GitHub-powered backend layer for portfolio generation, API integrations, and developer dashboards.

## Features

- **Multi-Platform Repository Sync**: Support for GitHub, GitLab, and Bitbucket
- **AI-Powered Enrichment**: Automatic technology detection, description generation, and project categorization
- **Public Developer Profiles**: Customizable public profiles for showcasing projects
- **Comprehensive Authentication**: JWT tokens, API keys, magic links, and OAuth
- **Real-time Webhooks**: Instant synchronization with repository changes
- **GraphQL & REST APIs**: Flexible data access patterns
- **Advanced Monitoring**: Comprehensive metrics, logging, and health checks

## Authentication

GitSink supports multiple authentication methods:

1. **API Keys**: For programmatic access and integrations
2. **JWT Tokens**: For user sessions and web applications
3. **Magic Links**: For passwordless authentication
4. **OAuth**: GitHub, GitLab, and Bitbucket integration

## Rate Limiting

All endpoints are protected by tiered rate limiting:
- **Short**: 3 requests per second
- **Medium**: 20 requests per 10 seconds  
- **Long**: 100 requests per minute
- **Custom**: Endpoint-specific limits for sensitive operations

## Error Handling

All API responses follow consistent error formats with appropriate HTTP status codes and detailed error messages.
      `,
      )
      .setVersion('1.0.0')
      .setContact('GitSink Support', 'https://gitsink.com/support', 'support@gitsink.com')
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addServer('https://api.gitsink.com', 'Production')
      .addServer('https://staging-api.gitsink.com', 'Staging')
      .addServer('http://localhost:3000', 'Development')

      // Authentication schemes
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header',
          description:
            'API key for programmatic access. Get your API key from the dashboard or via /auth/api-key/regenerate endpoint.',
        },
        'x-api-key',
      )
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'JWT token for user authentication. Obtain via /auth/signin or /auth/magic-link/validate endpoints.',
        },
        'bearer',
      )
      .addOAuth2(
        {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://github.com/login/oauth/authorize',
              tokenUrl: 'https://github.com/login/oauth/access_token',
              scopes: {
                repo: 'Access to repositories',
                'user:email': 'Access to user email',
              },
            },
          },
          description: 'GitHub OAuth for repository access',
        },
        'github-oauth',
      )

      // Global tags
      .addTag('Authentication', 'User authentication and authorization endpoints')
      .addTag('Projects', 'Repository synchronization and project management')
      .addTag('AI Enrichment', 'AI-powered project analysis and enrichment')
      .addTag('Profiles', 'Public developer profiles and customization')
      .addTag('Webhooks', 'Real-time repository event processing')
      .addTag('Health', 'System health and monitoring endpoints')
      .addTag('Metrics', 'Performance and usage metrics')
      .addTag('Audit', 'Audit trails and sync history')
      .addTag('Sandbox', 'Testing and development environment')
      .addTag('Waitlist', 'User waitlist management')

      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
      deepScanRoutes: true,
    });

    // Customize the document
    document.info.termsOfService = 'https://gitsink.com/terms';

    // Add custom extensions
    document['x-logo'] = {
      url: 'https://gitsink.com/logo.png',
      altText: 'GitSink Logo',
    };

    SwaggerModule.setup('api-docs', app, document, {
      customSiteTitle: 'GitSink API Documentation',
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #2c3e50; font-size: 36px; }
        .swagger-ui .info .description { margin: 20px 0; }
        .swagger-ui .scheme-container { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        tryItOutEnabled: true,
      },
    });
  }
}
