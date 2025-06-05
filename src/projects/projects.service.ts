import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private parser: ParserService,
    private config: ConfigService,
  ) {}

  async syncProjectFromGitHub(
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
    try {
      const mdResponse = await axios.get<string>(rawMdUrl);
      const mdRaw: string = mdResponse.data;
      parsedMd = this.parser.parseMarkdown(mdRaw);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          console.warn(`Portfolio.md not found at ${rawMdUrl}`);
        } else {
          console.error(`Error fetching Portfolio.md: ${err.message}`);
        }
      } else {
        console.error(
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

    return await this.prisma.project.upsert({
      where: {
        ownerId_repoUrl: {
          ownerId: 'mock-user-id',
          repoUrl,
        },
      },
      create: {
        ownerId: 'mock-user-id',
        title,
        description,
        tags: parsedMd?.tags || [],
        icon: parsedMd?.icon,
        image: parsedMd?.image,
        demoUrl: parsedMd?.demoUrl,
        repoUrl,
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
  }

  async getAllProjectsForUser(userId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getProjectByRepoUrl(
    repoUrl: string,
    userId: string,
  ): Promise<Project | null> {
    return this.prisma.project.findUnique({
      where: {
        ownerId_repoUrl: {
          ownerId: userId,
          repoUrl,
        },
      },
    });
  }

  async syncAllReposForUser(): Promise<Project[]> {
    // In future: retrieve user's GitHub token from DB
    const token = this.config.get<string>('GITHUB_PERSONAL_TOKEN');
    const headers = { Authorization: `token ${token}` };

    const repos = await axios.get<GitHubRepo[]>(
      'https://api.github.com/user/repos?per_page=100&affiliation=owner',
      { headers },
    );

    const syncedProjects: Project[] = [];
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
          console.warn(
            `Error fetching Profile.md for ${String(repo.full_name)}: ${err.message}`,
          );
        }
      }
      try {
        if (blacklisted) {
          await this.prisma.project.upsert({
            where: {
              ownerId_repoUrl: {
                ownerId: 'mock-user-id',
                repoUrl: String(repoUrl),
              },
            },
            create: {
              ownerId: 'mock-user-id',
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

        const project = await this.syncProjectFromGitHub(
          String(repoUrl),
          typeof repo.default_branch === 'string'
            ? repo.default_branch
            : 'main',
          false,
        );
        syncedProjects.push(project);
      } catch (e) {
        console.warn(`Failed to sync repo: ${String(repo.full_name)}`, e);
      }
    }

    return syncedProjects;
  }
}
