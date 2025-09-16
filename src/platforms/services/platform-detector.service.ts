import { Injectable } from '@nestjs/common';
import { PlatformType } from '../types/platform.types';

@Injectable()
export class PlatformDetectorService {
  /**
   * Detect platform from repository URL
   */
  detectPlatform(url: string): PlatformType | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const normalizedUrl = url.toLowerCase().trim();

    if (this.isGitHubUrl(normalizedUrl)) {
      return 'github';
    }

    if (this.isGitLabUrl(normalizedUrl)) {
      return 'gitlab';
    }

    if (this.isBitbucketUrl(normalizedUrl)) {
      return 'bitbucket';
    }

    return null;
  }

  /**
   * Check if URL is a GitHub repository
   */
  private isGitHubUrl(url: string): boolean {
    const patterns = [/github\.com/, /git@github\.com:/];

    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a GitLab repository
   */
  private isGitLabUrl(url: string): boolean {
    const patterns = [/gitlab\.com/, /git@gitlab\.com:/];

    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a Bitbucket repository
   */
  private isBitbucketUrl(url: string): boolean {
    const patterns = [/bitbucket\.org/, /git@bitbucket\.org:/];

    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Get all supported platforms
   */
  getSupportedPlatforms(): PlatformType[] {
    return ['github', 'gitlab', 'bitbucket'];
  }

  /**
   * Validate if platform is supported
   */
  isPlatformSupported(platform: string): platform is PlatformType {
    return this.getSupportedPlatforms().includes(platform as PlatformType);
  }

  /**
   * Get platform display name
   */
  getPlatformDisplayName(platform: PlatformType): string {
    const displayNames: Record<PlatformType, string> = {
      github: 'GitHub',
      gitlab: 'GitLab',
      bitbucket: 'Bitbucket',
    };

    return displayNames[platform];
  }

  /**
   * Get platform base URL
   */
  getPlatformBaseUrl(platform: PlatformType): string {
    const baseUrls: Record<PlatformType, string> = {
      github: 'https://github.com',
      gitlab: 'https://gitlab.com',
      bitbucket: 'https://bitbucket.org',
    };

    return baseUrls[platform];
  }

  /**
   * Normalize repository URL for consistent storage
   */
  normalizeRepositoryUrl(url: string): string {
    if (!url) return url;

    let normalized = url.trim();

    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, '');

    // Remove .git suffix
    normalized = normalized.replace(/\.git$/, '');

    // Convert SSH URLs to HTTPS
    normalized = normalized
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/^git@gitlab\.com:/, 'https://gitlab.com/')
      .replace(/^git@bitbucket\.org:/, 'https://bitbucket.org/');

    return normalized;
  }

  /**
   * Extract owner and repository name from URL
   */
  parseRepositoryUrl(url: string): { platform: PlatformType; owner: string; repo: string } | null {
    const platform = this.detectPlatform(url);
    if (!platform) {
      return null;
    }

    const normalizedUrl = this.normalizeRepositoryUrl(url);

    // Common pattern for all platforms: domain.com/owner/repo
    const match = normalizedUrl.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return null;
    }

    return {
      platform,
      owner: match[1],
      repo: match[2],
    };
  }

  /**
   * Generate repository URL for a platform
   */
  generateRepositoryUrl(platform: PlatformType, owner: string, repo: string): string {
    const baseUrl = this.getPlatformBaseUrl(platform);
    return `${baseUrl}/${owner}/${repo}`;
  }

  /**
   * Check if two URLs refer to the same repository
   */
  isSameRepository(url1: string, url2: string): boolean {
    const parsed1 = this.parseRepositoryUrl(url1);
    const parsed2 = this.parseRepositoryUrl(url2);

    if (!parsed1 || !parsed2) {
      return false;
    }

    return (
      parsed1.platform === parsed2.platform &&
      parsed1.owner === parsed2.owner &&
      parsed1.repo === parsed2.repo
    );
  }
}
