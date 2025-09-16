import {
  parseGitHubRepoUrl,
  buildGitHubRepoUrl,
  isValidGitHubRepoUrl,
  parseGitHubApiUrl,
  buildGitHubRawUrl,
  buildGitHubApiUrl,
} from './github.utils';

describe('GitHub Utils', () => {
  describe('parseGitHubRepoUrl', () => {
    describe('valid URLs', () => {
      it('should parse valid GitHub HTTPS URL', () => {
        const url = 'https://github.com/owner/repo';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should parse GitHub URL with .git extension', () => {
        const url = 'https://github.com/owner/repo.git';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should parse SSH URL', () => {
        const url = 'git@github.com:owner/repo.git';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should parse SSH URL without .git', () => {
        const url = 'git@github.com:owner/repo';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should parse GitHub CLI format', () => {
        const url = 'owner/repo';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should handle URLs with hyphens and underscores', () => {
        const url = 'https://github.com/my-org/my_repo';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'my-org', repo: 'my_repo' });
      });

      it('should handle URLs with numbers', () => {
        const url = 'https://github.com/user123/repo456';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'user123', repo: 'repo456' });
      });

      it('should handle URLs with dots in repo name', () => {
        const url = 'https://github.com/owner/repo.name';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo.name' });
      });

      it('should handle HTTP URLs', () => {
        const url = 'http://github.com/owner/repo';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });

      it('should handle URLs with trailing paths', () => {
        const url = 'https://github.com/owner/repo/tree/main';
        const result = parseGitHubRepoUrl(url);
        expect(result).toEqual({ owner: 'owner', repo: 'repo' });
      });
    });

    describe('invalid URLs', () => {
      it('should throw error for non-GitHub URL', () => {
        const url = 'https://gitlab.com/owner/repo';
        expect(() => parseGitHubRepoUrl(url)).toThrow('Invalid GitHub repo URL format');
      });

      it('should throw error for empty string', () => {
        const url = '';
        expect(() => parseGitHubRepoUrl(url)).toThrow('URL must be a non-empty string');
      });

      it('should throw error for null/undefined', () => {
        expect(() => parseGitHubRepoUrl(null as any)).toThrow('URL must be a non-empty string');
        expect(() => parseGitHubRepoUrl(undefined as any)).toThrow(
          'URL must be a non-empty string',
        );
      });

      it('should throw error for invalid owner name', () => {
        const url = 'https://github.com/-invalid/repo';
        expect(() => parseGitHubRepoUrl(url)).toThrow('Invalid GitHub owner name');
      });

      it('should throw error for invalid repo name', () => {
        const url = 'https://github.com/owner/';
        expect(() => parseGitHubRepoUrl(url)).toThrow(
          'Invalid GitHub repo URL: missing owner or repository name',
        );
      });

      it('should throw error for malformed URL', () => {
        const url = 'not-a-url';
        expect(() => parseGitHubRepoUrl(url)).toThrow('Invalid GitHub repo URL format');
      });

      it('should throw error for URL with special characters in repo name', () => {
        const url = 'https://github.com/owner/repo@invalid';
        expect(() => parseGitHubRepoUrl(url)).toThrow('Invalid GitHub repository name');
      });
    });
  });

  describe('buildGitHubRepoUrl', () => {
    it('should build HTTPS URL by default', () => {
      const result = buildGitHubRepoUrl('owner', 'repo');
      expect(result).toBe('https://github.com/owner/repo');
    });

    it('should build HTTPS URL when specified', () => {
      const result = buildGitHubRepoUrl('owner', 'repo', 'https');
      expect(result).toBe('https://github.com/owner/repo');
    });

    it('should build SSH URL when specified', () => {
      const result = buildGitHubRepoUrl('owner', 'repo', 'ssh');
      expect(result).toBe('git@github.com:owner/repo.git');
    });

    it('should throw error for missing owner', () => {
      expect(() => buildGitHubRepoUrl('', 'repo')).toThrow('Owner and repo name are required');
    });

    it('should throw error for missing repo', () => {
      expect(() => buildGitHubRepoUrl('owner', '')).toThrow('Owner and repo name are required');
    });
  });

  describe('isValidGitHubRepoUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidGitHubRepoUrl('https://github.com/owner/repo')).toBe(true);
      expect(isValidGitHubRepoUrl('git@github.com:owner/repo.git')).toBe(true);
      expect(isValidGitHubRepoUrl('owner/repo')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidGitHubRepoUrl('https://gitlab.com/owner/repo')).toBe(false);
      expect(isValidGitHubRepoUrl('')).toBe(false);
      expect(isValidGitHubRepoUrl('not-a-url')).toBe(false);
    });
  });

  describe('parseGitHubApiUrl', () => {
    it('should parse valid GitHub API URL', () => {
      const url = 'https://api.github.com/repos/owner/repo';
      const result = parseGitHubApiUrl(url);
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should throw error for invalid API URL', () => {
      const url = 'https://github.com/owner/repo';
      expect(() => parseGitHubApiUrl(url)).toThrow('Invalid GitHub API URL');
    });

    it('should handle API URLs with additional paths', () => {
      const url = 'https://api.github.com/repos/owner/repo/contents';
      const result = parseGitHubApiUrl(url);
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });
  });

  describe('buildGitHubRawUrl', () => {
    it('should build raw URL with default branch', () => {
      const result = buildGitHubRawUrl('owner', 'repo', undefined, 'README.md');
      expect(result).toBe('https://raw.githubusercontent.com/owner/repo/main/README.md');
    });

    it('should build raw URL with specified branch', () => {
      const result = buildGitHubRawUrl('owner', 'repo', 'develop', 'src/index.js');
      expect(result).toBe('https://raw.githubusercontent.com/owner/repo/develop/src/index.js');
    });

    it('should handle file paths with leading slash', () => {
      const result = buildGitHubRawUrl('owner', 'repo', 'main', '/src/index.js');
      expect(result).toBe('https://raw.githubusercontent.com/owner/repo/main/src/index.js');
    });

    it('should throw error for missing parameters', () => {
      expect(() => buildGitHubRawUrl('', 'repo', 'main', 'file.txt')).toThrow(
        'Owner, repo, and filePath are required',
      );
      expect(() => buildGitHubRawUrl('owner', '', 'main', 'file.txt')).toThrow(
        'Owner, repo, and filePath are required',
      );
      expect(() => buildGitHubRawUrl('owner', 'repo', 'main', '')).toThrow(
        'Owner, repo, and filePath are required',
      );
    });
  });

  describe('buildGitHubApiUrl', () => {
    it('should build API URL', () => {
      const result = buildGitHubApiUrl('owner', 'repo');
      expect(result).toBe('https://api.github.com/repos/owner/repo');
    });

    it('should throw error for missing parameters', () => {
      expect(() => buildGitHubApiUrl('', 'repo')).toThrow('Owner and repo name are required');
      expect(() => buildGitHubApiUrl('owner', '')).toThrow('Owner and repo name are required');
    });
  });

  describe('integration tests', () => {
    it('should parse and rebuild URLs consistently', () => {
      const originalUrl = 'https://github.com/owner/repo';
      const parsed = parseGitHubRepoUrl(originalUrl);
      const rebuilt = buildGitHubRepoUrl(parsed.owner, parsed.repo);
      expect(rebuilt).toBe(originalUrl);
    });

    it('should handle complex repository names', () => {
      const complexRepo = 'my-awesome-project.v2';
      const url = `https://github.com/my-org/${complexRepo}`;
      const parsed = parseGitHubRepoUrl(url);
      expect(parsed.repo).toBe(complexRepo);

      const rebuilt = buildGitHubRepoUrl(parsed.owner, parsed.repo);
      expect(rebuilt).toBe(url);
    });

    it('should work with real GitHub repository examples', () => {
      const realUrls = [
        'https://github.com/microsoft/TypeScript',
        'https://github.com/facebook/react',
        'https://github.com/nodejs/node',
        'https://github.com/vercel/next.js',
      ];

      realUrls.forEach(url => {
        expect(isValidGitHubRepoUrl(url)).toBe(true);
        const parsed = parseGitHubRepoUrl(url);
        expect(parsed.owner).toBeTruthy();
        expect(parsed.repo).toBeTruthy();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle single character owner and repo names', () => {
      const url = 'https://github.com/a/b';
      const result = parseGitHubRepoUrl(url);
      expect(result).toEqual({ owner: 'a', repo: 'b' });
    });

    it('should handle maximum length names', () => {
      const longName = 'a'.repeat(39); // GitHub max username length
      const url = `https://github.com/${longName}/${longName}`;
      const result = parseGitHubRepoUrl(url);
      expect(result).toEqual({ owner: longName, repo: longName });
    });

    it('should handle numeric-only names', () => {
      const url = 'https://github.com/123/456';
      const result = parseGitHubRepoUrl(url);
      expect(result).toEqual({ owner: '123', repo: '456' });
    });
  });
});
