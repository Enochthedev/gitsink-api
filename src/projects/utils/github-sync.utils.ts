import axios from 'axios';
import { GITHUB_CONSTANTS, SYNC_CONSTANTS } from '../../common/constants';
import { DatabaseError, ExternalServiceError } from '../../common/utils/error.utils';
import { GitHubRepo } from '../../types/github.types';
import { parseGitHubRepoUrl } from '../../utils/github.utils';

/**
 * GitHub sync utility functions
 */

export interface GitHubSyncContext {
  userId: string;
  repoUrl: string;
  branch: string;
  syncId: string;
  operationStart: number;
}

export interface GitHubRepoData {
  repoData: GitHubRepo;
  portfolioMdExists: boolean;
  parsedMd: any | null;
  validationErrors: string[];
  valid: boolean;
}

/**
 * Fetches repository data from GitHub API
 */
export async function fetchGitHubRepoData(
  repoUrl: string,
  context: GitHubSyncContext,
): Promise<GitHubRepo> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const githubApiUrl = `${GITHUB_CONSTANTS.API_BASE}/repos/${owner}/${repo}`;

  try {
    const response = await axios.get<GitHubRepo>(githubApiUrl, {
      timeout: GITHUB_CONSTANTS.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': GITHUB_CONSTANTS.USER_AGENT,
        Accept: GITHUB_CONSTANTS.ACCEPT_HEADER,
      },
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;

      switch (statusCode) {
        case 404:
          throw new ExternalServiceError(
            `Repository not found: ${repoUrl}`,
            'GITHUB_REPO_NOT_FOUND',
            { repoUrl, statusCode },
            context.syncId,
            context.userId,
          );
        case 403:
          throw new ExternalServiceError(
            `Access denied to repository: ${repoUrl}. Check GitHub token permissions.`,
            'GITHUB_ACCESS_DENIED',
            { repoUrl, statusCode },
            context.syncId,
            context.userId,
          );
        case 401:
          throw new ExternalServiceError(
            'GitHub authentication failed. Check GitHub token validity.',
            'GITHUB_AUTH_FAILED',
            { repoUrl, statusCode },
            context.syncId,
            context.userId,
          );
        default:
          if (error.code === 'ECONNABORTED') {
            throw new ExternalServiceError(
              `GitHub API request timeout for repository: ${repoUrl}`,
              'GITHUB_TIMEOUT',
              { repoUrl, timeout: GITHUB_CONSTANTS.REQUEST_TIMEOUT },
              context.syncId,
              context.userId,
            );
          }
      }
    }

    throw new ExternalServiceError(
      `Failed to fetch repository data: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB_API_ERROR',
      {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      context.syncId,
      context.userId,
    );
  }
}

/**
 * Fetches and parses Portfolio.md file
 */
export async function fetchAndParsePortfolioMd(
  repoUrl: string,
  branch: string,
  parser: any,
  context: GitHubSyncContext,
): Promise<{
  parsedMd: any | null;
  validationErrors: string[];
  valid: boolean;
  portfolioMdExists: boolean;
}> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const rawMdUrl = `${GITHUB_CONSTANTS.RAW_BASE}/${owner}/${repo}/${branch}/Portfolio.md`;

  let parsedMd: any | null = null;
  let validationErrors: string[] = [];
  let valid = true;
  let portfolioMdExists = false;

  try {
    const response = await axios.get<string>(rawMdUrl, {
      timeout: GITHUB_CONSTANTS.MD_REQUEST_TIMEOUT,
      headers: {
        'User-Agent': GITHUB_CONSTANTS.USER_AGENT,
        Accept: GITHUB_CONSTANTS.RAW_ACCEPT_HEADER,
      },
    });

    const mdRaw = response.data;
    portfolioMdExists = true;

    // Parse markdown with error handling
    try {
      const result = parser.parseMarkdown(mdRaw);
      if (result.valid) {
        parsedMd = result.data;
      } else {
        valid = false;
        validationErrors = result.errors.map((error: any) =>
          error instanceof Error ? error.message : String(error),
        );
      }
    } catch (parseError) {
      valid = false;
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      validationErrors = [`Markdown parsing failed: ${errorMessage}`];
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (statusCode === 404) {
        // Portfolio.md not found is not an error - many repos don't have it
        return {
          parsedMd: null,
          validationErrors: [],
          valid: true,
          portfolioMdExists: false,
        };
      } else if (statusCode === 403) {
        validationErrors.push('Access denied to Portfolio.md file');
      } else if (error.code === 'ECONNABORTED') {
        validationErrors.push('Timeout fetching Portfolio.md file');
      } else {
        validationErrors.push(`Failed to fetch Portfolio.md: ${error.message}`);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      validationErrors.push(`Unexpected error: ${errorMessage}`);
    }
  }

  return { parsedMd, validationErrors, valid, portfolioMdExists };
}

/**
 * Builds project data for database upsert
 */
export function buildProjectData(
  userId: string,
  repoUrl: string,
  repoData: GitHubRepo,
  parsedMd: any | null,
  validationErrors: string[],
  valid: boolean,
  blacklisted: boolean = false,
): any {
  const title = parsedMd?.title || repoData.name;
  const description = parsedMd?.description || repoData.description || '';

  return {
    ownerId: userId,
    title,
    description,
    tags: parsedMd?.tags || [],
    icon: parsedMd?.icon,
    image: parsedMd?.image,
    demoUrl: parsedMd?.demoUrl,
    repoUrl,
    valid,
    validationErrors,
    featured: parsedMd?.featured ?? false,
    published: parsedMd?.published ?? false,
    category: parsedMd?.category,
    order: parsedMd?.order,
    blacklisted,
    markdown: parsedMd?.body || '',
    collaborators: repoData?.contributors_url ? [] : [],
    firstCommitAt: null,
    lastCommitAt: new Date(repoData.pushed_at),
    githubMetadata: repoData as any,
    customMetadata: parsedMd?.custom || {},
    syncedAt: new Date(),
    // Enhanced fields from GitHub API
    platform: 'github',
    platformId: String(repoData.id),
    defaultBranch: (repoData.default_branch as string) || 'main',
    language: (repoData.language as string) || null,
    starCount: Number(repoData.stargazers_count) || 0,
    forkCount: Number(repoData.forks_count) || 0,
    isPrivate: Boolean(repoData.private) || false,
    license: (repoData.license as any)?.name || null,
    topics: Array.isArray(repoData.topics) ? repoData.topics : [],
    size: Number(repoData.size) || null,
    openIssues: Number(repoData.open_issues_count) || 0,
    hasWiki: Boolean(repoData.has_wiki) || false,
    hasPages: Boolean(repoData.has_pages) || false,
    archived: Boolean(repoData.archived) || false,
    disabled: Boolean(repoData.disabled) || false,
    pushedAt: repoData.pushed_at ? new Date(repoData.pushed_at) : null,
  };
}

/**
 * Checks if another sync is in progress for the same repository
 */
export function shouldSkipConcurrentSync(
  existingProject: { syncedAt: Date | null } | null,
  context: GitHubSyncContext,
): boolean {
  if (!existingProject?.syncedAt) {
    return false;
  }

  const timeSinceLastSync = Date.now() - existingProject.syncedAt.getTime();
  return timeSinceLastSync < GITHUB_CONSTANTS.CONCURRENT_SYNC_THRESHOLD;
}

/**
 * Generates cache keys for project data
 */
export function generateProjectCacheKeys(userId: string, repoUrl: string): string[] {
  return [`user:${userId}:repo:${repoUrl}`, `user:${userId}:projects`, `projects:${userId}`];
}

/**
 * Calculates retry delay for failed sync operations
 */
export function calculateSyncRetryDelay(attempt: number): number {
  return Math.min(
    SYNC_CONSTANTS.RETRY_DELAY_BASE * Math.pow(2, attempt),
    SYNC_CONSTANTS.MAX_RETRY_DELAY,
  );
}

/**
 * Validates sync operation parameters
 */
export function validateSyncParameters(userId: string, repoUrl: string, branch: string): void {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid user ID');
  }

  if (!repoUrl || typeof repoUrl !== 'string') {
    throw new Error('Invalid repository URL');
  }

  if (!branch || typeof branch !== 'string') {
    throw new Error('Invalid branch name');
  }

  // Validate GitHub URL format
  try {
    parseGitHubRepoUrl(repoUrl);
  } catch (error) {
    throw new Error(
      `Invalid GitHub repository URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Creates a unique sync operation ID
 */
export function generateSyncId(userId: string, repoUrl: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `sync_${userId}_${timestamp}_${random}`;
}
