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

interface GitHubUser {
    id: number;
    login: string;
    email?: string;
    name?: string;
    avatar_url?: string;
}

interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    description?: string;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    default_branch: string;
    language?: string;
    topics: string[];
    created_at: string;
    updated_at: string;
    pushed_at: string;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    private: boolean;
    fork: boolean;
    archived: boolean;
    disabled: boolean;
    has_wiki: boolean;
    has_pages: boolean;
    has_issues: boolean;
    has_projects: boolean;
    has_downloads: boolean;
    license?: {
        key: string;
        name: string;
        spdx_id: string;
    };
    size: number;
    owner: {
        id: number;
        login: string;
        type: 'User' | 'Organization';
        avatar_url?: string;
    };
}

interface GitHubContent {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url?: string;
    type: 'file' | 'dir';
    content?: string;
    encoding?: 'base64' | 'utf-8';
}

@Injectable()
export class GitHubProvider extends BaseRepositoryProvider {
    readonly name: PlatformType = 'github';
    readonly apiBaseUrl = 'https://api.github.com';
    readonly webhookEvents = [
        'push',
        'pull_request',
        'issues',
        'issue_comment',
        'pull_request_review',
        'pull_request_review_comment',
        'create',
        'delete',
        'release',
        'star',
        'fork',
    ];

    constructor(config: ConfigService) {
        super(config);
    }

    async authenticate(credentials: PlatformCredentials): Promise<AuthResult> {
        try {
            const response = await this.makeAuthenticatedRequest<GitHubUser>(
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
                    username: user.login,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar_url,
                },
            };
        } catch (error) {
            this.logger.error('GitHub authentication failed:', error);
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
            if (options.sort) params.append('sort', options.sort);
            if (options.direction) params.append('direction', options.direction);
            if (options.affiliation) params.append('affiliation', options.affiliation);
            if (options.visibility) params.append('visibility', options.visibility);

            const response = await this.makeAuthenticatedRequest<GitHubRepository[]>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/user/repos?${params.toString()}`,
                },
            );

            const repositories = response.data.map((repo) => this.transformRepository(repo));

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
            const response = await this.makeAuthenticatedRequest<GitHubRepository>(
                credentials,
                {
                    method: 'GET',
                    url: `${this.apiBaseUrl}/repos/${owner}/${repo}`,
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
            const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/contents/${path}`;
            const params = branch ? `?ref=${branch}` : '';

            const response = await this.makeAuthenticatedRequest<GitHubContent>(
                credentials,
                {
                    method: 'GET',
                    url: `${url}${params}`,
                },
            );

            const content = response.data;
            if (content.type !== 'file') {
                throw new Error(`Path ${path} is not a file`);
            }

            return {
                data: {
                    path: content.path,
                    content: content.content || '',
                    encoding: (content.encoding as 'base64' | 'utf8') || 'base64',
                    sha: content.sha,
                    size: content.size,
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
            const webhookSecret = this.config.get<string>('GITHUB_WEBHOOK_SECRET') || 'default-secret';

            const response = await this.makeAuthenticatedRequest<any>(
                credentials,
                {
                    method: 'POST',
                    url: `${this.apiBaseUrl}/repos/${owner}/${repo}/hooks`,
                    data: {
                        name: 'web',
                        active: true,
                        events,
                        config: {
                            url: webhookUrl,
                            content_type: 'json',
                            secret: webhookSecret,
                            insecure_ssl: '0',
                        },
                    },
                },
            );

            return {
                success: true,
                webhookId: response.data.id.toString(),
                webhookUrl: response.data.config.url,
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
            await this.makeAuthenticatedRequest(
                credentials,
                {
                    method: 'DELETE',
                    url: `${this.apiBaseUrl}/repos/${owner}/${repo}/hooks/${webhookId}`,
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
            const expectedSignature = `sha256=${crypto
                .createHmac('sha256', secret)
                .update(payload, 'utf8')
                .digest('hex')}`;

            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature),
            );
        } catch (error) {
            this.logger.error('Failed to validate webhook signature:', error);
            return false;
        }
    }

    parseRepositoryUrl(url: string): { owner: string; repo: string } | null {
        const patterns = [
            /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
            /github\.com\/([^\/]+)\/([^\/]+)$/,
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
        return /github\.com/.test(url);
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
            scope: scopes.join(' '),
            response_type: 'code',
        });

        if (state) {
            params.append('state', state);
        }

        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    async exchangeCodeForToken(
        clientId: string,
        clientSecret: string,
        code: string,
        redirectUri: string,
    ): Promise<PlatformCredentials> {
        try {
            const response = await this.httpClient.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
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
                scopes: data.scope ? data.scope.split(',') : [],
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
                'https://github.com/login/oauth/access_token',
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
                scopes: data.scope ? data.scope.split(',') : [],
            };
        } catch (error) {
            this.handleApiError(error, 'Refresh access token');
        }
    }

    private transformRepository(repo: GitHubRepository): Repository {
        const owner: RepositoryOwner = {
            id: repo.owner.id.toString(),
            username: repo.owner.login,
            type: repo.owner.type.toLowerCase() as 'user' | 'organization',
            avatar: repo.owner.avatar_url,
        };

        return {
            id: repo.id.toString(),
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || undefined,
            htmlUrl: repo.html_url,
            cloneUrl: repo.clone_url,
            sshUrl: repo.ssh_url,
            defaultBranch: repo.default_branch,
            language: repo.language || undefined,
            topics: repo.topics || [],
            createdAt: new Date(repo.created_at),
            updatedAt: new Date(repo.updated_at),
            pushedAt: new Date(repo.pushed_at),
            starCount: repo.stargazers_count,
            forkCount: repo.forks_count,
            openIssuesCount: repo.open_issues_count,
            isPrivate: repo.private,
            isFork: repo.fork,
            isArchived: repo.archived,
            isDisabled: repo.disabled,
            hasWiki: repo.has_wiki,
            hasPages: repo.has_pages,
            hasIssues: repo.has_issues,
            hasProjects: repo.has_projects,
            hasDownloads: repo.has_downloads,
            license: repo.license?.spdx_id || undefined,
            size: repo.size,
            platform: 'github',
            platformMetadata: {
                githubId: repo.id,
                nodeId: (repo as any).node_id,
                gitUrl: (repo as any).git_url,
                svnUrl: (repo as any).svn_url,
                homepage: (repo as any).homepage,
                forksUrl: (repo as any).forks_url,
                keysUrl: (repo as any).keys_url,
                collaboratorsUrl: (repo as any).collaborators_url,
                teamsUrl: (repo as any).teams_url,
                hooksUrl: (repo as any).hooks_url,
                issueEventsUrl: (repo as any).issue_events_url,
                eventsUrl: (repo as any).events_url,
                assigneesUrl: (repo as any).assignees_url,
                branchesUrl: (repo as any).branches_url,
                tagsUrl: (repo as any).tags_url,
                blobsUrl: (repo as any).blobs_url,
                gitTagsUrl: (repo as any).git_tags_url,
                gitRefsUrl: (repo as any).git_refs_url,
                treesUrl: (repo as any).trees_url,
                statusesUrl: (repo as any).statuses_url,
                languagesUrl: (repo as any).languages_url,
                stargazersUrl: (repo as any).stargazers_url,
                contributorsUrl: (repo as any).contributors_url,
                subscribersUrl: (repo as any).subscribers_url,
                subscriptionUrl: (repo as any).subscription_url,
                commitsUrl: (repo as any).commits_url,
                gitCommitsUrl: (repo as any).git_commits_url,
                commentsUrl: (repo as any).comments_url,
                issueCommentUrl: (repo as any).issue_comment_url,
                contentsUrl: (repo as any).contents_url,
                compareUrl: (repo as any).compare_url,
                mergesUrl: (repo as any).merges_url,
                archiveUrl: (repo as any).archive_url,
                downloadsUrl: (repo as any).downloads_url,
                issuesUrl: (repo as any).issues_url,
                pullsUrl: (repo as any).pulls_url,
                milestonesUrl: (repo as any).milestones_url,
                notificationsUrl: (repo as any).notifications_url,
                labelsUrl: (repo as any).labels_url,
                releasesUrl: (repo as any).releases_url,
                deploymentsUrl: (repo as any).deployments_url,
            },
            owner,
        };
    }
}