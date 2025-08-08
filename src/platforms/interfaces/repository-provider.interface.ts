import {
    PlatformCredentials,
    AuthResult,
    Repository,
    WebhookResult,
    RepositoryContent,
    PlatformApiResponse,
    PlatformType,
} from '../types/platform.types';

export interface RepositoryProvider {
    readonly name: PlatformType;
    readonly apiBaseUrl: string;
    readonly webhookEvents: string[];

    /**
     * Authenticate with the platform using provided credentials
     */
    authenticate(credentials: PlatformCredentials): Promise<AuthResult>;

    /**
     * Fetch all repositories for the authenticated user
     */
    fetchRepositories(
        credentials: PlatformCredentials,
        options?: {
            page?: number;
            perPage?: number;
            sort?: 'created' | 'updated' | 'pushed' | 'full_name';
            direction?: 'asc' | 'desc';
            affiliation?: 'owner' | 'collaborator' | 'organization_member';
            visibility?: 'all' | 'public' | 'private';
        },
    ): Promise<PlatformApiResponse<Repository[]>>;

    /**
     * Fetch a specific repository by owner and name
     */
    fetchRepository(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
    ): Promise<PlatformApiResponse<Repository>>;

    /**
     * Fetch file content from a repository
     */
    fetchFileContent(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        path: string,
        branch?: string,
    ): Promise<PlatformApiResponse<RepositoryContent>>;

    /**
     * Fetch Portfolio.md file from repository
     */
    fetchPortfolioFile(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        branch?: string,
    ): Promise<PlatformApiResponse<string | null>>;

    /**
     * Setup webhook for repository events
     */
    setupWebhook(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        webhookUrl: string,
        events?: string[],
    ): Promise<WebhookResult>;

    /**
     * Remove webhook from repository
     */
    removeWebhook(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        webhookId: string,
    ): Promise<boolean>;

    /**
     * Validate webhook signature
     */
    validateWebhookSignature(
        payload: string,
        signature: string,
        secret: string,
    ): boolean;

    /**
     * Parse repository URL to extract owner and repo name
     */
    parseRepositoryUrl(url: string): { owner: string; repo: string } | null;

    /**
     * Check if URL belongs to this platform
     */
    isValidUrl(url: string): boolean;

    /**
     * Get OAuth authorization URL
     */
    getAuthorizationUrl(
        clientId: string,
        redirectUri: string,
        scopes: string[],
        state?: string,
    ): string;

    /**
     * Exchange authorization code for access token
     */
    exchangeCodeForToken(
        clientId: string,
        clientSecret: string,
        code: string,
        redirectUri: string,
    ): Promise<PlatformCredentials>;

    /**
     * Refresh access token using refresh token
     */
    refreshAccessToken(
        clientId: string,
        clientSecret: string,
        refreshToken: string,
    ): Promise<PlatformCredentials>;
}