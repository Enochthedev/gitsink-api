import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { PlatformDetectorService } from './services/platform-detector.service';
import { PlatformRegistryService } from './services/platform-registry.service';

// Providers
import { GitHubProvider } from './providers/github.provider';
import { GitLabProvider } from './providers/gitlab.provider';
import { BitbucketProvider } from './providers/bitbucket.provider';

// Controllers
import { GitLabOAuthController } from './controllers/gitlab-oauth.controller';
import { BitbucketOAuthController } from './controllers/bitbucket-oauth.controller';
import { GitLabWebhookController } from './controllers/gitlab-webhook.controller';
import { BitbucketWebhookController } from './controllers/bitbucket-webhook.controller';

@Module({
  imports: [ConfigModule],
  controllers: [
    GitLabOAuthController,
    BitbucketOAuthController,
    GitLabWebhookController,
    BitbucketWebhookController,
  ],
  providers: [
    // Core services
    PlatformDetectorService,
    PlatformRegistryService,

    // Platform providers
    GitHubProvider,
    GitLabProvider,
    BitbucketProvider,
  ],
  exports: [
    // Export services for use in other modules
    PlatformDetectorService,
    PlatformRegistryService,

    // Export providers for direct access if needed
    GitHubProvider,
    GitLabProvider,
    BitbucketProvider,
  ],
})
export class PlatformsModule {}
