import { Test, TestingModule } from '@nestjs/testing';
import { PlatformDetectorService } from './platform-detector.service';

describe('PlatformDetectorService', () => {
  let service: PlatformDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformDetectorService],
    }).compile();

    service = module.get<PlatformDetectorService>(PlatformDetectorService);
  });

  describe('detectPlatform', () => {
    it('should detect GitHub URLs', () => {
      const urls = [
        'https://github.com/user/repo',
        'https://github.com/user/repo.git',
        'https://github.com/user/repo/',
        'git@github.com:user/repo.git',
        'HTTPS://GITHUB.COM/USER/REPO',
      ];

      urls.forEach(url => {
        expect(service.detectPlatform(url)).toBe('github');
      });
    });

    it('should detect GitLab URLs', () => {
      const urls = [
        'https://gitlab.com/user/repo',
        'https://gitlab.com/user/repo.git',
        'https://gitlab.com/user/repo/',
        'git@gitlab.com:user/repo.git',
        'HTTPS://GITLAB.COM/USER/REPO',
      ];

      urls.forEach(url => {
        expect(service.detectPlatform(url)).toBe('gitlab');
      });
    });

    it('should detect Bitbucket URLs', () => {
      const urls = [
        'https://bitbucket.org/user/repo',
        'https://bitbucket.org/user/repo.git',
        'https://bitbucket.org/user/repo/',
        'git@bitbucket.org:user/repo.git',
        'HTTPS://BITBUCKET.ORG/USER/REPO',
      ];

      urls.forEach(url => {
        expect(service.detectPlatform(url)).toBe('bitbucket');
      });
    });

    it('should return null for unsupported platforms', () => {
      const urls = [
        'https://example.com/user/repo',
        'https://sourceforge.net/projects/repo',
        'invalid-url',
        '',
        null,
        undefined,
      ];

      urls.forEach(url => {
        expect(service.detectPlatform(url as any)).toBeNull();
      });
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return all supported platforms', () => {
      const platforms = service.getSupportedPlatforms();
      expect(platforms).toEqual(['github', 'gitlab', 'bitbucket']);
    });
  });

  describe('isPlatformSupported', () => {
    it('should return true for supported platforms', () => {
      expect(service.isPlatformSupported('github')).toBe(true);
      expect(service.isPlatformSupported('gitlab')).toBe(true);
      expect(service.isPlatformSupported('bitbucket')).toBe(true);
    });

    it('should return false for unsupported platforms', () => {
      expect(service.isPlatformSupported('sourceforge')).toBe(false);
      expect(service.isPlatformSupported('invalid')).toBe(false);
      expect(service.isPlatformSupported('')).toBe(false);
    });
  });

  describe('getPlatformDisplayName', () => {
    it('should return correct display names', () => {
      expect(service.getPlatformDisplayName('github')).toBe('GitHub');
      expect(service.getPlatformDisplayName('gitlab')).toBe('GitLab');
      expect(service.getPlatformDisplayName('bitbucket')).toBe('Bitbucket');
    });
  });

  describe('getPlatformBaseUrl', () => {
    it('should return correct base URLs', () => {
      expect(service.getPlatformBaseUrl('github')).toBe('https://github.com');
      expect(service.getPlatformBaseUrl('gitlab')).toBe('https://gitlab.com');
      expect(service.getPlatformBaseUrl('bitbucket')).toBe('https://bitbucket.org');
    });
  });

  describe('normalizeRepositoryUrl', () => {
    it('should normalize GitHub URLs', () => {
      const testCases = [
        {
          input: 'https://github.com/user/repo.git',
          expected: 'https://github.com/user/repo',
        },
        {
          input: 'https://github.com/user/repo/',
          expected: 'https://github.com/user/repo',
        },
        {
          input: 'git@github.com:user/repo.git',
          expected: 'https://github.com/user/repo',
        },
        {
          input: 'https://github.com/user/repo///',
          expected: 'https://github.com/user/repo',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(service.normalizeRepositoryUrl(input)).toBe(expected);
      });
    });

    it('should normalize GitLab URLs', () => {
      const testCases = [
        {
          input: 'https://gitlab.com/user/repo.git',
          expected: 'https://gitlab.com/user/repo',
        },
        {
          input: 'git@gitlab.com:user/repo.git',
          expected: 'https://gitlab.com/user/repo',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(service.normalizeRepositoryUrl(input)).toBe(expected);
      });
    });

    it('should normalize Bitbucket URLs', () => {
      const testCases = [
        {
          input: 'https://bitbucket.org/user/repo.git',
          expected: 'https://bitbucket.org/user/repo',
        },
        {
          input: 'git@bitbucket.org:user/repo.git',
          expected: 'https://bitbucket.org/user/repo',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(service.normalizeRepositoryUrl(input)).toBe(expected);
      });
    });
  });

  describe('parseRepositoryUrl', () => {
    it('should parse GitHub URLs correctly', () => {
      const result = service.parseRepositoryUrl('https://github.com/octocat/Hello-World');
      expect(result).toEqual({
        platform: 'github',
        owner: 'octocat',
        repo: 'Hello-World',
      });
    });

    it('should parse GitLab URLs correctly', () => {
      const result = service.parseRepositoryUrl('https://gitlab.com/gitlab-org/gitlab');
      expect(result).toEqual({
        platform: 'gitlab',
        owner: 'gitlab-org',
        repo: 'gitlab',
      });
    });

    it('should parse Bitbucket URLs correctly', () => {
      const result = service.parseRepositoryUrl('https://bitbucket.org/atlassian/stash');
      expect(result).toEqual({
        platform: 'bitbucket',
        owner: 'atlassian',
        repo: 'stash',
      });
    });

    it('should return null for invalid URLs', () => {
      const invalidUrls = [
        'https://example.com/user/repo',
        'invalid-url',
        '',
        'https://github.com/user',
        'https://github.com/',
      ];

      invalidUrls.forEach(url => {
        expect(service.parseRepositoryUrl(url)).toBeNull();
      });
    });
  });

  describe('generateRepositoryUrl', () => {
    it('should generate correct URLs for all platforms', () => {
      expect(service.generateRepositoryUrl('github', 'user', 'repo')).toBe(
        'https://github.com/user/repo',
      );

      expect(service.generateRepositoryUrl('gitlab', 'user', 'repo')).toBe(
        'https://gitlab.com/user/repo',
      );

      expect(service.generateRepositoryUrl('bitbucket', 'user', 'repo')).toBe(
        'https://bitbucket.org/user/repo',
      );
    });
  });

  describe('isSameRepository', () => {
    it('should return true for same repositories with different URL formats', () => {
      const url1 = 'https://github.com/user/repo';
      const url2 = 'https://github.com/user/repo.git';
      const url3 = 'git@github.com:user/repo.git';

      expect(service.isSameRepository(url1, url2)).toBe(true);
      expect(service.isSameRepository(url1, url3)).toBe(true);
      expect(service.isSameRepository(url2, url3)).toBe(true);
    });

    it('should return false for different repositories', () => {
      const url1 = 'https://github.com/user1/repo1';
      const url2 = 'https://github.com/user2/repo2';
      const url3 = 'https://gitlab.com/user1/repo1';

      expect(service.isSameRepository(url1, url2)).toBe(false);
      expect(service.isSameRepository(url1, url3)).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      const validUrl = 'https://github.com/user/repo';
      const invalidUrl = 'invalid-url';

      expect(service.isSameRepository(validUrl, invalidUrl)).toBe(false);
      expect(service.isSameRepository(invalidUrl, validUrl)).toBe(false);
      expect(service.isSameRepository(invalidUrl, invalidUrl)).toBe(false);
    });
  });
});
