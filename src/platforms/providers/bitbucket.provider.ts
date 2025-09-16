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

interface BitbucketUser {
  uuid: string;
  username: string;
  display_name: string;
  account_id: string;
  nickname?: string;
  type: 'user';
  links: {
    self: { href: string };
    avatar: { href: string };
    html: { href: string };
  };
}

interface BitbucketRepository {
  uuid: string;
  name: string;
  full_name: string;
  description?: string;
  scm: 'git' | 'hg';
  website?: string;
  language?: string;
  has_issues: boolean;
  has_wiki: boolean;
  fork_policy: 'allow_forks' | 'no_public_forks' | 'no_forks';
  created_on: string;
  updated_on: string;
  size: number;
  is_private: boolean;
  mainbranch?: {
    type: 'branch';
    name: string;
  };
  links: {
    self: { href: string };
    html: { href: string };
    avatar: { href: string };
    pullrequests: { href: string };
    commits: { href: string };
    forks: { href: string };
    watchers: { href: string };
    downloads: { href: string };
    clone: Array<{
      name: 'https' | 'ssh';
      href: string;
    }>;
  };
  owner: {
    uuid: string;
    username: string;
    display_name: string;
    type: 'user' | 'team';
    links: {
      self: { href: string };
      avatar: { href: string };
      html: { href: string };
    };
  };
  workspace: {
    uuid: string;
    name: string;
    slug: string;
    type: 'workspace';
    links: {
      self: { href: string };
      html: { href: string };
      avatar: { href: string };
    };
  };
  project?: {
    uuid: string;
    key: string;
    name: string;
    type: 'project';
    links: {
      self: { href: string };
      html: { href: string };
      avatar: { href: string };
    };
  };
  parent?: {
    uuid: string;
    name: string;
    full_name: string;
    type: 'repository';
    links: {
      self: { href: string };
      html: { href: string };
      avatar: { href: string };
    };
  };
}

interface BitbucketFile {
  type: 'commit_file';
  path: string;
  commit: {
    hash: string;
    type: 'commit';
    links: {
      self: { href: string };
      html: { href: string };
    };
  };
  attributes: string[];
  size: number;
  links: {
    self: { href: string };
    meta: { href: string };
    history: { href: string };
  };
}

@Injectable()
export class BitbucketProvider extends BaseRepositoryProvider {
  readonly name: PlatformType = 'bitbucket';
  readonly apiBaseUrl = 'https://api.bitbucket.org/2.0';
  readonly webhookEvents = [
    'repo:push',
    'repo:fork',
    'repo:commit_comment_created',
    'repo:commit_status_created',
    'repo:commit_status_updated',
    'issue:created',
    'issue:updated',
    'issue:comment_created',
    'pullrequest:created',
    'pullrequest:updated',
    'pullrequest:approved',
    'pullrequest:unapproved',
    'pullrequest:fulfilled',
    'pullrequest:rejected',
    'pullrequest:comment_created',
    'pullrequest:comment_updated',
    'pullrequest:comment_deleted',
  ];

  constructor(config: ConfigService) {
    super(config);
  }

  async authenticate(credentials: PlatformCredentials): Promise<AuthResult> {
    try {
      const response = await this.makeAuthenticatedRequest<BitbucketUser>(credentials, {
        method: 'GET',
        url: `${this.apiBaseUrl}/user`,
      });

      const user = response.data;
      return {
        success: true,
        user: {
          id: user.uuid,
          username: user.username,
          name: user.display_name,
          avatar: user.links.avatar.href,
        },
      };
    } catch (error) {
      this.logger.error('Bitbucket authentication failed:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Authentication failed',
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
      if (options.perPage) params.append('pagelen', options.perPage.toString());

      // Bitbucket uses different parameter names
      if (options.sort) {
        const sortMap = {
          created: 'created_on',
          updated: 'updated_on',
          pushed: 'updated_on',
          full_name: 'name',
        };
        const sortField = sortMap[options.sort] || 'created_on';
        const direction = options.direction === 'desc' ? '-' : '';
        params.append('sort', `${direction}${sortField}`);
      }

      // Bitbucket role parameter
      if (options.affiliation === 'owner') {
        params.append('role', 'owner');
      } else if (options.affiliation === 'collaborator') {
        params.append('role', 'contributor');
      }

      const response = await this.makeAuthenticatedRequest<{
        values: BitbucketRepository[];
        page: number;
        pagelen: number;
        size: number;
        next?: string;
      }>(credentials, {
        method: 'GET',
        url: `${this.apiBaseUrl}/repositories?role=member&${params.toString()}`,
      });

      const repositories = response.data.values.map(repo => this.transformRepository(repo));

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
      const response = await this.makeAuthenticatedRequest<BitbucketRepository>(credentials, {
        method: 'GET',
        url: `${this.apiBaseUrl}/repositories/${owner}/${repo}`,
      });

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
      const ref = branch || 'main';

      // First get file metadata
      const metaResponse = await this.makeAuthenticatedRequest<BitbucketFile>(credentials, {
        method: 'GET',
        url: `${this.apiBaseUrl}/repositories/${owner}/${repo}/src/${ref}/${path}?format=meta`,
      });

      // Then get file content
      const contentResponse = await this.makeAuthenticatedRequest<string>(credentials, {
        method: 'GET',
        url: `${this.apiBaseUrl}/repositories/${owner}/${repo}/src/${ref}/${path}`,
        headers: {
          Accept: 'text/plain',
        },
      });

      return {
        data: {
          path: metaResponse.data.path,
          content: contentResponse.data,
          encoding: 'utf8',
          sha: metaResponse.data.commit.hash,
          size: metaResponse.data.size,
        },
        rateLimit: contentResponse.rateLimit,
        headers: contentResponse.headers,
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
      const response = await this.makeAuthenticatedRequest<any>(credentials, {
        method: 'POST',
        url: `${this.apiBaseUrl}/repositories/${owner}/${repo}/hooks`,
        data: {
          description: 'Gitsink webhook',
          url: webhookUrl,
          active: true,
          events,
        },
      });

      return {
        success: true,
        webhookId: response.data.uuid,
        webhookUrl: response.data.url,
      };
    } catch (error) {
      this.logger.error(`Failed to setup webhook for ${owner}/${repo}:`, error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Failed to setup webhook',
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
      await this.makeAuthenticatedRequest(credentials, {
        method: 'DELETE',
        url: `${this.apiBaseUrl}/repositories/${owner}/${repo}/hooks/${webhookId}`,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to remove webhook ${webhookId} from ${owner}/${repo}:`, error);
      return false;
    }
  }

  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      // Bitbucket uses SHA256 HMAC
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (error) {
      this.logger.error('Failed to validate webhook signature:', error);
      return false;
    }
  }

  parseRepositoryUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
      /bitbucket\.org\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /bitbucket\.org\/([^\/]+)\/([^\/]+)$/,
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
    return /bitbucket\.org/.test(url);
  }

  getAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes: string[],
    state?: string,
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: scopes.join(' '),
    });

    if (state) {
      params.append('state', state);
    }

    return `https://bitbucket.org/site/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<PlatformCredentials> {
    try {
      const response = await this.httpClient.post(
        'https://bitbucket.org/site/oauth2/access_token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
        }),
        {
          auth: {
            username: clientId,
            password: clientSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
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
        scopes: data.scopes ? data.scopes.split(' ') : [],
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
        'https://bitbucket.org/site/oauth2/access_token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          auth: {
            username: clientId,
            password: clientSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
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
        scopes: data.scopes ? data.scopes.split(' ') : [],
      };
    } catch (error) {
      this.handleApiError(error, 'Refresh access token');
    }
  }

  private transformRepository(repo: BitbucketRepository): Repository {
    const owner: RepositoryOwner = {
      id: repo.owner.uuid,
      username: repo.owner.username,
      type: repo.owner.type === 'user' ? 'user' : 'organization',
      avatar: repo.owner.links.avatar.href,
    };

    const cloneUrl = repo.links.clone.find(link => link.name === 'https')?.href || '';
    const sshUrl = repo.links.clone.find(link => link.name === 'ssh')?.href || '';

    return {
      id: repo.uuid,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || undefined,
      htmlUrl: repo.links.html.href,
      cloneUrl,
      sshUrl,
      defaultBranch: repo.mainbranch?.name || 'main',
      language: repo.language || undefined,
      topics: [], // Bitbucket doesn't have topics in the API response
      createdAt: new Date(repo.created_on),
      updatedAt: new Date(repo.updated_on),
      pushedAt: new Date(repo.updated_on),
      starCount: 0, // Bitbucket doesn't provide star count in repositories API
      forkCount: 0, // Would need separate API call to get fork count
      openIssuesCount: 0, // Would need separate API call to get issue count
      isPrivate: repo.is_private,
      isFork: !!repo.parent,
      isArchived: false, // Bitbucket doesn't have archived status
      isDisabled: false,
      hasWiki: repo.has_wiki,
      hasPages: false, // Bitbucket doesn't have pages
      hasIssues: repo.has_issues,
      hasProjects: true,
      hasDownloads: true,
      license: undefined, // Would need separate API call to get license
      size: repo.size,
      platform: 'bitbucket',
      platformMetadata: {
        bitbucketUuid: repo.uuid,
        scm: repo.scm,
        website: repo.website,
        forkPolicy: repo.fork_policy,
        workspace: repo.workspace,
        project: repo.project,
        parent: repo.parent,
        links: repo.links,
      },
      owner,
    };
  }
}
