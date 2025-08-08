export type PlatformType = 'github' | 'gitlab' | 'bitbucket';

export interface PlatformCredentials {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    scopes?: string[];
}

export interface AuthResult {
    success: boolean;
    user?: PlatformUser;
    error?: string;
}

export interface PlatformUser {
    id: string;
    username: string;
    email?: string;
    name?: string;
    avatar?: string;
}

export interface Repository {
    id: string;
    name: string;
    fullName: string;
    description?: string;
    htmlUrl: string;
    cloneUrl: string;
    sshUrl?: string;
    defaultBranch: string;
    language?: string;
    languages?: Record<string, number>;
    topics: string[];
    createdAt: Date;
    updatedAt: Date;
    pushedAt: Date;
    starCount: number;
    forkCount: number;
    openIssuesCount: number;
    isPrivate: boolean;
    isFork: boolean;
    isArchived: boolean;
    isDisabled: boolean;
    hasWiki: boolean;
    hasPages: boolean;
    hasIssues: boolean;
    hasProjects: boolean;
    hasDownloads: boolean;
    license?: string;
    size: number;
    platform: PlatformType;
    platformMetadata: Record<string, any>;
    owner: RepositoryOwner;
}

export interface RepositoryOwner {
    id: string;
    username: string;
    type: 'user' | 'organization';
    avatar?: string;
}

export interface WebhookResult {
    success: boolean;
    webhookId?: string;
    webhookUrl?: string;
    error?: string;
}

export interface RepositoryContent {
    path: string;
    content: string;
    encoding: 'base64' | 'utf8';
    sha?: string;
    size: number;
}

export interface PlatformRateLimit {
    limit: number;
    remaining: number;
    resetAt: Date;
}

export interface PlatformApiResponse<T> {
    data: T;
    rateLimit?: PlatformRateLimit;
    headers?: Record<string, string>;
}