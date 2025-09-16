import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlatformRegistryService } from './platform-registry.service';
import { PlatformDetectorService } from './platform-detector.service';
import { GitHubProvider } from '../providers/github.provider';
import { GitLabProvider } from '../providers/gitlab.provider';
import { BitbucketProvider } from '../providers/bitbucket.provider';

describe('PlatformRegistryService', () => {
  let service: PlatformRegistryService;
  let platformDetector: jest.Mocked<PlatformDetectorService>;
  let githubProvider: jest.Mocked<GitHubProvider>;
  let gitlabProvider: jest.Mocked<GitLabProvider>;
  let bitbucketProvider: jest.Mocked<BitbucketProvider>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformRegistryService,
        {
          provide: PlatformDetectorService,
          useValue: {
            detectPlatform: jest.fn(),
            getSupportedPlatforms: jest.fn().mockReturnValue(['github', 'gitlab', 'bitbucket']),
            isPlatformSupported: jest.fn(),
            getPlatformDisplayName: jest.fn(),
            getPlatformBaseUrl: jest.fn(),
          },
        },
        {
          provide: GitHubProvider,
          useValue: {
            name: 'github',
            apiBaseUrl: 'https://api.github.com',
            webhookEvents: ['push', 'pull_request'],
            parseRepositoryUrl: jest.fn(),
          },
        },
        {
          provide: GitLabProvider,
          useValue: {
            name: 'gitlab',
            apiBaseUrl: 'https://gitlab.com/api/v4',
            webhookEvents: ['push_events', 'merge_requests_events'],
            parseRepositoryUrl: jest.fn(),
          },
        },
        {
          provide: BitbucketProvider,
          useValue: {
            name: 'bitbucket',
            apiBaseUrl: 'https://api.bitbucket.org/2.0',
            webhookEvents: ['repo:push', 'pullrequest:created'],
            parseRepositoryUrl: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformRegistryService>(PlatformRegistryService);
    platformDetector = module.get(PlatformDetectorService);
    githubProvider = module.get(GitHubProvider);
    gitlabProvider = module.get(GitLabProvider);
    bitbucketProvider = module.get(BitbucketProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProvider', () => {
    it('should return GitHub provider', () => {
      const provider = service.getProvider('github');
      expect(provider).toBe(githubProvider);
    });

    it('should return GitLab provider', () => {
      const provider = service.getProvider('gitlab');
      expect(provider).toBe(gitlabProvider);
    });

    it('should return Bitbucket provider', () => {
      const provider = service.getProvider('bitbucket');
      expect(provider).toBe(bitbucketProvider);
    });

    it('should return null for unsupported platform', () => {
      const provider = service.getProvider('unsupported' as any);
      expect(provider).toBeNull();
    });
  });

  describe('getProviderByUrl', () => {
    it('should return provider for GitHub URL', () => {
      platformDetector.detectPlatform.mockReturnValue('github');

      const provider = service.getProviderByUrl('https://github.com/user/repo');

      expect(provider).toBe(githubProvider);
      expect(platformDetector.detectPlatform).toHaveBeenCalledWith('https://github.com/user/repo');
    });

    it('should return provider for GitLab URL', () => {
      platformDetector.detectPlatform.mockReturnValue('gitlab');

      const provider = service.getProviderByUrl('https://gitlab.com/user/repo');

      expect(provider).toBe(gitlabProvider);
      expect(platformDetector.detectPlatform).toHaveBeenCalledWith('https://gitlab.com/user/repo');
    });

    it('should return null for unsupported URL', () => {
      platformDetector.detectPlatform.mockReturnValue(null);

      const provider = service.getProviderByUrl('https://example.com/user/repo');

      expect(provider).toBeNull();
      expect(platformDetector.detectPlatform).toHaveBeenCalledWith('https://example.com/user/repo');
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
      expect(service.isPlatformSupported('unsupported')).toBe(false);
    });
  });

  describe('getProviderCapabilities', () => {
    it('should return GitHub provider capabilities', () => {
      const capabilities = service.getProviderCapabilities('github');

      expect(capabilities).toEqual({
        name: 'github',
        apiBaseUrl: 'https://api.github.com',
        webhookEvents: ['push', 'pull_request'],
        supportsOAuth: true,
        supportsWebhooks: true,
      });
    });

    it('should return null for unsupported platform', () => {
      const capabilities = service.getProviderCapabilities('unsupported' as any);
      expect(capabilities).toBeNull();
    });
  });

  describe('validateRepositoryUrl', () => {
    it('should validate GitHub repository URL', () => {
      platformDetector.detectPlatform.mockReturnValue('github');
      githubProvider.parseRepositoryUrl.mockReturnValue({
        owner: 'user',
        repo: 'repo',
      });

      const result = service.validateRepositoryUrl('https://github.com/user/repo');

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe('github');
      expect(result.provider).toBe(githubProvider);
      expect(result.parsed).toEqual({ owner: 'user', repo: 'repo' });
    });

    it('should return invalid for unsupported platform', () => {
      platformDetector.detectPlatform.mockReturnValue(null);

      const result = service.validateRepositoryUrl('https://example.com/user/repo');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported platform or invalid URL format');
    });

    it('should return invalid for unparseable URL', () => {
      platformDetector.detectPlatform.mockReturnValue('github');
      githubProvider.parseRepositoryUrl.mockReturnValue(null);

      const result = service.validateRepositoryUrl('https://github.com/invalid');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Could not parse repository URL');
    });
  });

  describe('getOAuthConfig', () => {
    it('should return GitHub OAuth config', () => {
      platformDetector.getPlatformBaseUrl.mockReturnValue('https://github.com');

      const config = service.getOAuthConfig('github');

      expect(config).toEqual({
        authorizationUrl: 'https://github.com',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user:email'],
      });
    });

    it('should return GitLab OAuth config', () => {
      platformDetector.getPlatformBaseUrl.mockReturnValue('https://gitlab.com');

      const config = service.getOAuthConfig('gitlab');

      expect(config).toEqual({
        authorizationUrl: 'https://gitlab.com',
        tokenUrl: 'https://gitlab.com/oauth/token',
        scopes: ['read_user', 'read_repository', 'write_repository'],
      });
    });

    it('should return Bitbucket OAuth config', () => {
      platformDetector.getPlatformBaseUrl.mockReturnValue('https://bitbucket.org');

      const config = service.getOAuthConfig('bitbucket');

      expect(config).toEqual({
        authorizationUrl: 'https://bitbucket.org',
        tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
        scopes: ['repositories', 'account'],
      });
    });

    it('should return null for unsupported platform', () => {
      const config = service.getOAuthConfig('unsupported' as any);
      expect(config).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status for all providers', async () => {
      const result = await service.healthCheck();

      expect(result).toEqual({
        github: { status: 'healthy' },
        gitlab: { status: 'healthy' },
        bitbucket: { status: 'healthy' },
      });
    });
  });
});
