import { Injectable, Logger } from '@nestjs/common';
import { RepositoryProvider } from '../interfaces/repository-provider.interface';
import { GitHubProvider } from '../providers/github.provider';
import { GitLabProvider } from '../providers/gitlab.provider';
import { BitbucketProvider } from '../providers/bitbucket.provider';
import { PlatformDetectorService } from './platform-detector.service';
import { PlatformType } from '../types/platform.types';

@Injectable()
export class PlatformRegistryService {
    private readonly logger = new Logger(PlatformRegistryService.name);
    private readonly providers = new Map<PlatformType, RepositoryProvider>();

    constructor(
        private readonly platformDetector: PlatformDetectorService,
        private readonly githubProvider: GitHubProvider,
        private readonly gitlabProvider: GitLabProvider,
        private readonly bitbucketProvider: BitbucketProvider,
    ) {
        this.registerProviders();
    }

    /**
     * Register all platform providers
     */
    private registerProviders(): void {
        this.providers.set('github', this.githubProvider);
        this.providers.set('gitlab', this.gitlabProvider);
        this.providers.set('bitbucket', this.bitbucketProvider);

        this.logger.log(`Registered ${this.providers.size} platform providers`);
    }

    /**
     * Get provider for a specific platform
     */
    getProvider(platform: PlatformType): RepositoryProvider | null {
        const provider = this.providers.get(platform);
        if (!provider) {
            this.logger.warn(`No provider found for platform: ${platform}`);
            return null;
        }
        return provider;
    }

    /**
     * Get provider by repository URL
     */
    getProviderByUrl(url: string): RepositoryProvider | null {
        const platform = this.platformDetector.detectPlatform(url);
        if (!platform) {
            this.logger.warn(`Could not detect platform for URL: ${url}`);
            return null;
        }
        return this.getProvider(platform);
    }

    /**
     * Get all registered providers
     */
    getAllProviders(): Map<PlatformType, RepositoryProvider> {
        return new Map(this.providers);
    }

    /**
     * Get all supported platform types
     */
    getSupportedPlatforms(): PlatformType[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if platform is supported
     */
    isPlatformSupported(platform: string): platform is PlatformType {
        return this.providers.has(platform as PlatformType);
    }

    /**
     * Get provider capabilities
     */
    getProviderCapabilities(platform: PlatformType): {
        name: PlatformType;
        apiBaseUrl: string;
        webhookEvents: string[];
        supportsOAuth: boolean;
        supportsWebhooks: boolean;
    } | null {
        const provider = this.getProvider(platform);
        if (!provider) {
            return null;
        }

        return {
            name: provider.name,
            apiBaseUrl: provider.apiBaseUrl,
            webhookEvents: provider.webhookEvents,
            supportsOAuth: true, // All our providers support OAuth
            supportsWebhooks: true, // All our providers support webhooks
        };
    }

    /**
     * Validate repository URL and return platform info
     */
    validateRepositoryUrl(url: string): {
        isValid: boolean;
        platform?: PlatformType;
        provider?: RepositoryProvider;
        parsed?: { owner: string; repo: string };
        error?: string;
    } {
        try {
            const platform = this.platformDetector.detectPlatform(url);
            if (!platform) {
                return {
                    isValid: false,
                    error: 'Unsupported platform or invalid URL format',
                };
            }

            const provider = this.getProvider(platform);
            if (!provider) {
                return {
                    isValid: false,
                    platform,
                    error: `No provider available for platform: ${platform}`,
                };
            }

            const parsed = provider.parseRepositoryUrl(url);
            if (!parsed) {
                return {
                    isValid: false,
                    platform,
                    provider,
                    error: 'Could not parse repository URL',
                };
            }

            return {
                isValid: true,
                platform,
                provider,
                parsed,
            };
        } catch (error) {
            this.logger.error('Error validating repository URL:', error);
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Unknown validation error',
            };
        }
    }

    /**
     * Get OAuth configuration for a platform
     */
    getOAuthConfig(platform: PlatformType): {
        authorizationUrl: string;
        tokenUrl: string;
        scopes: string[];
    } | null {
        const scopeMap: Record<PlatformType, string[]> = {
            github: ['repo', 'user:email'],
            gitlab: ['read_user', 'read_repository', 'write_repository'],
            bitbucket: ['repositories', 'account'],
        };

        const tokenUrls: Record<PlatformType, string> = {
            github: 'https://github.com/login/oauth/access_token',
            gitlab: 'https://gitlab.com/oauth/token',
            bitbucket: 'https://bitbucket.org/site/oauth2/access_token',
        };

        if (!this.isPlatformSupported(platform)) {
            return null;
        }

        return {
            authorizationUrl: this.platformDetector.getPlatformBaseUrl(platform),
            tokenUrl: tokenUrls[platform],
            scopes: scopeMap[platform],
        };
    }

    /**
     * Health check for all providers
     */
    async healthCheck(): Promise<Record<PlatformType, { status: 'healthy' | 'unhealthy'; error?: string }>> {
        const results: Record<string, { status: 'healthy' | 'unhealthy'; error?: string }> = {};

        for (const [platform, provider] of this.providers) {
            try {
                // Simple health check - just verify the provider is accessible
                if (provider && provider.name === platform) {
                    results[platform] = { status: 'healthy' };
                } else {
                    results[platform] = { status: 'unhealthy', error: 'Provider mismatch' };
                }
            } catch (error) {
                results[platform] = {
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        }

        return results as Record<PlatformType, { status: 'healthy' | 'unhealthy'; error?: string }>;
    }
}