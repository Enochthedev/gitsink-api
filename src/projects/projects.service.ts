import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Injectable, Inject } from '@nestjs/common';
import { ParserService } from '../parser/parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioMetadata } from '../parser/types/portfolio.types';
import axios from 'axios';
import matter from 'gray-matter';
import { Prisma, Project } from '@prisma/client';
import { parseGitHubRepoUrl } from '../utils/github.utils';
import { GitHubRepo } from '../types/github.types';
import { isInputJsonValue } from '../utils/is-json';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '../utils/encryption';
import { PinoLogger } from 'nestjs-pino';
import { SyncQueueService } from './sync-queue.service';

/**
 * Service encapsulating all project-related persistence logic. It handles
 * communication with GitHub, parsing markdown and caching results.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private parser: ParserService,
    private config: ConfigService,
    private readonly logger: PinoLogger,
    private readonly syncQueue: SyncQueueService,

    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.logger.setContext(ProjectsService.name);
  }

  async queueSyncProject(
    userId: string,
    repoUrl: string,
    branch = 'main',
  ): Promise<void> {
    await this.syncQueue.addJob(userId, repoUrl, branch);
  }

  /**
   * Fetch project data from GitHub and upsert it in the database.
   *
   * @param userId      Owner of the repository
   * @param repoUrl     HTTPS URL of the repository
   * @param branch      Branch containing the Portfolio.md file
   * @param blacklisted Whether the repo should be marked as blacklisted
   */
  async syncProjectFromGitHub(
    userId: string,
    repoUrl: string,
    branch = 'main',
    blacklisted = false,
  ): Promise<Project> {
    const { owner, repo } = parseGitHubRepoUrl(repoUrl);

    const githubApiBase = `${this.config.get<string>('GITHUB_API_BASE')}/${owner}/${repo}`;
    const rawMdUrl = `${this.config.get<string>('GITHUB_MD_URL')}/${owner}/${repo}/${branch}/Portfolio.md`;

    const repoResponse = await axios.get<GitHubRepo>(githubApiBase);
    const repoData: GitHubRepo = repoResponse.data;

    let parsedMd: PortfolioMetadata | null = null;
    let validationErrors: string[] = [];
    let valid = true;
    try {
      const mdResponse = await axios.get<string>(rawMdUrl);
      const mdRaw: string = mdResponse.data;
      const result = this.parser.parseMarkdown(mdRaw);
      if (result.valid) {
        parsedMd = result.data;
      } else {
        valid = false;
        validationErrors = result.errors;
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          this.logger.warn(`Portfolio.md not found at ${rawMdUrl}`);
        } else {
          this.logger.error(`Error fetching Portfolio.md: ${err.message}`);
        }
      } else {
        this.logger.error(
          `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const title = parsedMd?.title || repoData.name;
    const description = parsedMd?.description || repoData.description || '';

    let githubMetadata: Prisma.InputJsonValue = {};
    let customMetadata: Prisma.InputJsonValue = {};

    if (isInputJsonValue(repoData)) {
      githubMetadata = repoData;
    }

    if (isInputJsonValue(parsedMd?.custom)) {
      customMetadata = parsedMd.custom;
    }

    const project = await this.prisma.project.upsert({
      where: {
        ownerId_repoUrl: {
          ownerId: userId,
          repoUrl,
        },
      },
      create: {
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
        githubMetadata,
        customMetadata,
        syncedAt: new Date(),
      },
      update: {
        title,
        description,
        tags: parsedMd?.tags || [],
        icon: parsedMd?.icon,
        image: parsedMd?.image,
        demoUrl: parsedMd?.demoUrl,
        valid,
        validationErrors,
        featured: parsedMd?.featured ?? false,
        published: parsedMd?.published ?? false,
        category: parsedMd?.category,
        order: parsedMd?.order,
        blacklisted,
        markdown: parsedMd?.body || '',
        lastCommitAt: new Date(repoData.pushed_at),
        githubMetadata,
        customMetadata,
        syncedAt: new Date(),
      },
    });

    const cacheKey = `user:${project.ownerId}:repo:${repoUrl}`;
    await this.cache.del(cacheKey);
    await this.cache.del(`user:${project.ownerId}:projects`);
    await this.cache.set(cacheKey, project);

    return project;
  }

  /**
   * Return all projects belonging to the provided user. Results are cached to
   * avoid hitting the database repeatedly.
   */
  async getAllProjectsForUser(userId: string): Promise<Project[]> {
    const cacheKey = `user:${userId}:projects`;
    const cached = await this.cache.get<Project[]>(cacheKey);
    if (cached) return cached;

    const projects = await this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    await this.cache.set(cacheKey, projects);
    return projects;
  }

  /**
   * Retrieve projects for a user based on optional filter criteria.
   */
  async getFilteredProjectsForUser(
    filter: { tag?: string; category?: string; featured?: boolean },
    userId: string,
  ): Promise<Project[]> {
    const where: Prisma.ProjectWhereInput = { ownerId: userId };

    if (filter.tag) {
      where.tags = { has: filter.tag };
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (typeof filter.featured === 'boolean') {
      where.featured = filter.featured;
    }

    return this.prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Look up a single project by its repository URL. Cached results are
   * returned if available.
   */
  async getProjectByRepoUrl(
    repoUrl: string,
    userId: string,
  ): Promise<Project | null> {
    const cacheKey = `user:${userId}:repo:${repoUrl}`;
    const cached = await this.cache.get<Project>(cacheKey);
    if (cached) return cached;

    const project = await this.prisma.project.findUnique({
      where: {
        ownerId_repoUrl: {
          ownerId: userId,
          repoUrl,
        },
      },
    });
    if (project) await this.cache.set(cacheKey, project);
    return project;
  }

  /**
   * Fetch a project by its database ID ensuring it belongs to the given user.
   */
  async getProjectById(id: string, userId: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { id, ownerId: userId },
    });
  }

  /**
   * Synchronize all repositories for the given user, respecting any blacklist
   * flags found in `Profile.md`.
   */
  async syncAllReposForUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.githubToken) {
      throw new Error('GitHub token not found for user');
    }
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    const token = key ? decrypt(user.githubToken, key) : user.githubToken;

    const headers = { Authorization: `token ${token}` };

    const repos = await axios.get<GitHubRepo[]>(
      'https://api.github.com/user/repos?per_page=100&affiliation=owner',
      { headers },
    );

    for (const repo of repos.data) {
      const repoUrl = repo.html_url;
      const { owner, repo: repoName } = parseGitHubRepoUrl(String(repoUrl));
      const profileUrl = `${this.config.get<string>('GITHUB_MD_URL')}/${owner}/${repoName}/${
        typeof repo.default_branch === 'string' ? repo.default_branch : 'main'
      }/Profile.md`;
      let blacklisted = false;
      try {
        const profileRes = await axios.get<string>(profileUrl, { headers });
        const profileData = matter(profileRes.data).data as Record<
          string,
          unknown
        >;
        if (
          profileData['blacklisted'] === true ||
          profileData['blacklist'] === true ||
          profileData['allowed'] === false
        ) {
          blacklisted = true;
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status !== 404) {
          this.logger.warn(
            `Error fetching Profile.md for ${String(repo.full_name)}: ${err.message}`,
          );
        }
      }
      try {
        if (blacklisted) {
          await this.prisma.project.upsert({
            where: {
              ownerId_repoUrl: {
                ownerId: userId,
                repoUrl: String(repoUrl),
              },
            },
            create: {
              ownerId: userId,
              title: repo.name,
              description: repo.description || '',
              tags: [],
              repoUrl: String(repoUrl),
              featured: false,
              published: false,
              githubSync: false,
              blacklisted: true,
              markdown: '',
              collaborators: [],
              firstCommitAt: null,
              lastCommitAt: new Date(repo.pushed_at),
              githubMetadata: isInputJsonValue(repo)
                ? (repo as Prisma.InputJsonValue)
                : {},
              customMetadata: {},
              syncedAt: new Date(),
            },
            update: {
              blacklisted: true,
              githubMetadata: isInputJsonValue(repo)
                ? (repo as Prisma.InputJsonValue)
                : {},
              syncedAt: new Date(),
            },
          });
          continue;
        }

        await this.queueSyncProject(
          userId,
          String(repoUrl),
          typeof repo.default_branch === 'string'
            ? repo.default_branch
            : 'main',
        );
      } catch (e) {
        this.logger.warn(
          { err: e },
          `Failed to sync repo: ${String(repo.full_name)}`,
        );
      }
    }

    await this.cache.del(`projects:${userId}`);
  }
}
