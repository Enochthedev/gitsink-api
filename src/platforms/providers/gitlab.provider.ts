import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { BaseRepositoryProvider } from './base-repository.provider';
import {
    PlatformCredentials,
    AuthResult,
    Repository,
    WebhookResult,
    RepositoryContent,
    PlatformApiResponse,
    PlatformType,
    RepositoryOwner,
} from '../types/platform.types';

interface GitLabUser {
    id: number;
    username: string;
    email?: string;
    name?: string;
    avatar_url?: string;
}

interface GitLabProject {
    id: number;
    name: string;
    name_with_namespace: string;
    path: string;
    path_with_namespace: string;
    description?: string;
    web_url: string;
    http_url_to_repo: string;
    ssh_url_to_repo: string;
    default_branch: string;
    topics: string[];
    created_at: string;
    last_activity_at: string;
    star_count: number;
    forks_count: number;
    open_issues_count: number;
    visibility: 'private' | 'internal' | 'public';
    archived: boolean;
    issues_enabled: boolean;
    merge_requests_enabled: boolean;
    wiki_enabled: boolean;
    jobs_enabled: boolean;
    snippets_enabled: boolean;
    container_registry_enabled: boolean;
    service_desk_enabled: boolean;
    can_create_merge_request_in: boolean;
    issues_access_level: string;
    repository_access_level: string;
    merge_requests_access_level: string;
    forking_access_level: string;
    wiki_access_level: string;
    builds_access_level: string;
    snippets_access_level: string;
    pages_access_level: string;
    analytics_access_level: string;
    container_registry_access_level: string;
    security_and_compliance_access_level: string;
    releases_access_level: string;
    environments_access_level: string;
    feature_flags_access_level: string;
    infrastructure_access_level: string;
    monitor_access_level: string;
    model_experiments_access_level: string;
    model_registry_access_level: string;
    empty_repo: boolean;
    license?: {
        key: string;
        name: string;
        nickname?: string;
        html_url?: string;
        source_url?: string;
    };
    namespace: {
        id: number;
        name: string;
        path: string;
        kind: 'user' | 'group';
        full_path: string;
        parent_id?: number;
        avatar_url?: string;
        web_url: string;
    };
    owner?: {
        id: number;
        username: string;
        name: string;
        state: string;
        avatar_url?: string;
        web_url: string;
    };
}

interface GitLabFile {
    file_name: string;
    file_path: string;
    size: number;
    encoding: 'base64' | 'text';
    content_sha256: string;
    ref: string;
    blob_id: string;
    commit_id: string;
    last_commit_id: string;
    content: string;
}

@Injectable()
export class GitLabProvider extends BaseRepositoryProvider {
    readonly name: PlatformType = 'gitlab';
    readonly apiBaseUrl = 'https://gitlab.com/api/v4';
    readonly webhookEvents = [
        'push_events',
        'issues_events',
        'merge_requests_events',
        'tag_push_events',
        'note_events',
        'job_events',
        'pipeline_events',
        'wiki_page_events',
        'deployment_events',
        'feature_flag_events',
        'release_events',
    ];

    constructor(config: ConfigService) {
        super(config);
    }

    async authenticate(credentials: PlatformCredentials): Promise<AuthResult> {
        try {
            const response = await this.makeAuthenticatedRequest<GitLabUser>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/user`,
                },
            );

            const user = response.data;
            return {
                success: true,
                user: {
                    id: user.id.toString(),
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar_url,
                },
            };
        } catch (error) {
            this.logger.error('GitLab authentication failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Authentication failed',
            };
        }
    }

    async fetchRepositories(
        credentials: PlatformCredentials,
        options: {
            page?: number;
            perPage?: number;
            sort?: 'created' | 'updated' | 'pushed' | 'full_name';
            direction?: 'asc' | 'desc';
            affiliation?: 'owner' | 'collaborator' | 'organization_member';
            visibility?: 'all' | 'public' | 'private';
        } = {},
    ): Promise<PlatformApiResponse<Repository[]>> {
        try {
            const params = new URLSearchParams();
            if (options.page) params.append('page', options.page.toString());
            if (options.perPage) params.append('per_page', options.perPage.toString());

            // GitLab uses different parameter names
            if (options.sort) {
                const sortMap = {
                    created: 'created_at',
                    updated: 'updated_at',
                    pushed: 'last_activity_at',
                    full_name: 'name',
                };
                params.append('sort', sortMap[options.sort] || 'created_at');
            }

            if (options.direction) params.append('order_by', options.direction);
            if (options.visibility) {
                if (options.visibility !== 'all') {
                    params.append('visibility', options.visibility);
                }
            }

            // GitLab uses 'owned=true' for owner affiliation
            if (options.affiliation === 'owner') {
                params.append('owned', 'true');
            }

            const response = await this.makeAuthenticatedRequest<GitLabProject[]>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/projects?${params.toString()}`,
                },
            );

            const repositories = response.data.map((project) => this.transformRepository(project));

            return {
                data: repositories,
                rateLimit: response.rateLimit,
                headers: response.headers,
            };
        } catch (error) {
            this.handleApiError(error, 'Fetch repositories');
        }
    }

    async fetchRepository(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
    ): Promise<PlatformApiResponse<Repository>> {
        try {
            const projectPath = encodeURIComponent(`${owner}/${repo}`);
            const response = await this.makeAuthenticatedRequest<GitLabProject>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/projects/${projectPath}`,
                },
            );

            const repository = this.transformRepository(response.data);

            return {
                data: repository,
                rateLimit: response.rateLimit,
                headers: response.headers,
            };
        } catch (error) {
            this.handleApiError(error, `Fetch repository ${owner}/${repo}`);
        }
    }

    async fetchFileContent(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        path: string,
        branch?: string,
    ): Promise<PlatformApiResponse<RepositoryContent>> {
        try {
            const projectPath = encodeURIComponent(`${owner}/${repo}`);
            const filePath = encodeURIComponent(path);
            const ref = branch || 'main';

            const response = await this.makeAuthenticatedRequest<GitLabFile>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/projects/${projectPath}/repository/files/${filePath}?ref=${ref}`,
                },
            );

            const file = response.data;

            return {
                data: {
                    path: file.file_path,
                    content: file.content,
                    encoding: file.encoding === 'base64' ? 'base64' : 'utf8',
                    sha: file.blob_id,
                    size: file.size,
                },
                rateLimit: response.rateLimit,
                headers: response.headers,
            };
        } catch (error) {
            this.handleApiError(error, `Fetch file content ${owner}/${repo}/${path}`);
        }
    }

    async setupWebhook(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        webhookUrl: string,
        events: string[] = this.webhookEvents,
    ): Promise<WebhookResult> {
        try {
            const projectPath = encodeURIComponent(`${owner}/${repo}`);
            const webhookSecret = this.config.get<string>('GITLAB_WEBHOOK_SECRET') || 'default-secret';

            // Convert events to GitLab webhook format
            const webhookConfig: any = {
                url: webhookUrl,
                token: webhookSecret,
                enable_ssl_verification: true,
            };

            // Enable specific events
            events.forEach((event) => {
                webhookConfig[event] = true;
            });

            const response = await this.makeAuthenticatedRequest<any>(
                credentials,
                {
                    method: 'POST',
                    url: `${this.apiBaseUrl}/projects/${projectPath}/hooks`,
                    data: webhookConfig,
                },
            );

            return {
                success: true,
                webhookId: response.data.id.toString(),
                webhookUrl: response.data.url,
            };
        } catch (error) {
            this.logger.error(`Failed to setup webhook for ${owner}/${repo}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to setup webhook',
            };
        }
    }

    async removeWebhook(
        credentials: PlatformCredentials,
        owner: string,
        repo: string,
        webhookId: string,
    ): Promise<boolean> {
        try {
            const projectPath = encodeURIComponent(`${owner}/${repo}`);
            await this.makeAuthenticatedRequest(
                credentials,
                {
                    method: 'DELETE',
                    url: `${this.apiBaseUrl}/projects/${projectPath}/hooks/${webhookId}`,
                },
            );

            return true;
        } catch (error) {
            this.logger.error(`Failed to remove webhook ${webhookId} from ${owner}/${repo}:`, error);
            return false;
        }
    }

    validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
        try {
            // GitLab uses X-Gitlab-Token header for webhook authentication
            return signature === secret;
        } catch (error) {
            this.logger.error('Failed to validate webhook signature:', error);
            return false;
        }
    }

    parseRepositoryUrl(url: string): { owner: string; repo: string } | null {
        const patterns = [
            /gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
            /gitlab\.com\/([^\/]+)\/([^\/]+)$/,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2].replace(/\.git$/, ''),
                };
            }
        }

        return null;
    }

    isValidUrl(url: string): boolean {
        return /gitlab\.com/.test(url);
    }

    getAuthorizationUrl(
        clientId: string,
        redirectUri: string,
        scopes: string[],
        state?: string,
    ): string {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: scopes.join(' '),
        });

        if (state) {
            params.append('state', state);
        }

        return `https://gitlab.com/oauth/authorize?${params.toString()}`;
    }

    async exchangeCodeForToken(
        clientId: string,
        clientSecret: string,
        code: string,
        redirectUri: string,
    ): Promise<PlatformCredentials> {
        try {
            const response = await this.httpClient.post(
                'https://gitlab.com/oauth/token',
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                },
                {
                    headers: {
                        Accept: 'application/json',
                    },
                },
            );

            const data = response.data;
            if (data.error) {
                throw new Error(`OAuth error: ${data.error_description || data.error}`);
            }

            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
                scopes: data.scope ? data.scope.split(' ') : [],
            };
        } catch (error) {
            this.handleApiError(error, 'Exchange code for token');
        }
    }

    async refreshAccessToken(
        clientId: string,
        clientSecret: string,
        refreshToken: string,
    ): Promise<PlatformCredentials> {
        try {
            const response = await this.httpClient.post(
                'https://gitlab.com/oauth/token',
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                },
                {
                    headers: {
                        Accept: 'application/json',
                    },
                },
            );

            const data = response.data;
            if (data.error) {
                throw new Error(`OAuth refresh error: ${data.error_description || data.error}`);
            }

            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken,
                tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
                scopes: data.scope ? data.scope.split(' ') : [],
            };
        } catch (error) {
            this.handleApiError(error, 'Refresh access token');
        }
    }

    private transformRepository(project: GitLabProject): Repository {
        const owner: RepositoryOwner = {
            id: project.namespace.id.toString(),
            username: project.namespace.path,
            type: project.namespace.kind === 'user' ? 'user' : 'organization',
            avatar: project.namespace.avatar_url,
        };

        return {
            id: project.id.toString(),
            name: project.name,
            fullName: project.path_with_namespace,
            description: project.description || undefined,
            htmlUrl: project.web_url,
            cloneUrl: project.http_url_to_repo,
            sshUrl: project.ssh_url_to_repo,
            defaultBranch: project.default_branch,
            topics: project.topics || [],
            createdAt: new Date(project.created_at),
            updatedAt: new Date(project.last_activity_at),
            pushedAt: new Date(project.last_activity_at),
            starCount: project.star_count,
            forkCount: project.forks_count,
            openIssuesCount: project.open_issues_count,
            isPrivate: project.visibility === 'private',
            isFork: false, // GitLab doesn't have a direct fork flag in the API response
            isArchived: project.archived,
            isDisabled: false,
            hasWiki: project.wiki_enabled,
            hasPages: project.pages_access_level !== 'disabled',
            hasIssues: project.issues_enabled,
            hasProjects: true, // GitLab projects always exist
            hasDownloads: true,
            license: project.license?.key || undefined,
            size: 0, // GitLab doesn't provide repository size in the projects API
            platform: 'gitlab',
            platformMetadata: {
                gitlabId: project.id,
                path: project.path,
                pathWithNamespace: project.path_with_namespace,
                nameWithNamespace: project.name_with_namespace,
                visibility: project.visibility,
                namespace: project.namespace,
                owner: project.owner,
                emptyRepo: project.empty_repo,
                issuesEnabled: project.issues_enabled,
                mergeRequestsEnabled: project.merge_requests_enabled,
                wikiEnabled: project.wiki_enabled,
                jobsEnabled: project.jobs_enabled,
                snippetsEnabled: project.snippets_enabled,
                containerRegistryEnabled: project.container_registry_enabled,
                serviceDeskEnabled: project.service_desk_enabled,
                canCreateMergeRequestIn: project.can_create_merge_request_in,
                issuesAccessLevel: project.issues_access_level,
                repositoryAccessLevel: project.repository_access_level,
                mergeRequestsAccessLevel: project.merge_requests_access_level,
                forkingAccessLevel: project.forking_access_level,
                wikiAccessLevel: project.wiki_access_level,
                buildsAccessLevel: project.builds_access_level,
                snippetsAccessLevel: project.snippets_access_level,
                pagesAccessLevel: project.pages_access_level,
                analyticsAccessLevel: project.analytics_access_level,
                containerRegistryAccessLevel: project.container_registry_access_level,
                securityAndComplianceAccessLevel: project.security_and_compliance_access_level,
                releasesAccessLevel: project.releases_access_level,
                environmentsAccessLevel: project.environments_access_level,
                featureFlagsAccessLevel: project.feature_flags_access_level,
                infrastructureAccessLevel: project.infrastructure_access_level,
                monitorAccessLevel: project.monitor_access_level,
                modelExperimentsAccessLevel: project.model_experiments_access_level,
                modelRegistryAccessLevel: project.model_registry_access_level,
            },
            owner,
        };
    }
}