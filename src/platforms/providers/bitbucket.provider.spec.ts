import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BitbucketProvider } from './bitbucket.provider';

jest.mock('axios');

describe('BitbucketProvider', () => {
  let provider: BitbucketProvider;
  let configService: jest.Mocked<ConfigService>;

  const mockCredentials = {
    accessToken: 'test-token',
  };

  beforeEach(async () => {
    // Setup axios mock before creating the module
    const mockAxiosInstance = {
      request: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    const mockedAxios = require('axios');
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitbucketProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<BitbucketProvider>(BitbucketProvider);
    configService = module.get(ConfigService);

    // Replace the httpClient with our mock
    (provider as any).httpClient = mockAxiosInstance;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      const mockUser = {
        uuid: '{12345678-1234-1234-1234-123456789012}',
        username: 'testuser',
        display_name: 'Test User',
        account_id: '123456789',
        type: 'user',
        links: {
          self: { href: 'https://api.bitbucket.org/2.0/users/testuser' },
          avatar: { href: 'https://avatar.url' },
          html: { href: 'https://bitbucket.org/testuser' },
        },
      };

      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockUser,
        headers: {},
      });

      const result = await provider.authenticate(mockCredentials);

      expect(result.success).toBe(true);
      expect(result.user).toEqual({
        id: '{12345678-1234-1234-1234-123456789012}',
        username: 'testuser',
        name: 'Test User',
        avatar: 'https://avatar.url',
      });
    });

    it('should handle authentication failure', async () => {
      (provider as any).httpClient.request.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await provider.authenticate(mockCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('fetchRepository', () => {
    it('should fetch repository successfully', async () => {
      const mockRepo = {
        uuid: '{12345678-1234-1234-1234-123456789012}',
        name: 'test-repo',
        full_name: 'testuser/test-repo',
        description: 'Test repository',
        scm: 'git',
        website: 'https://example.com',
        language: 'TypeScript',
        has_issues: true,
        has_wiki: true,
        fork_policy: 'allow_forks',
        created_on: '2023-01-01T00:00:00+00:00',
        updated_on: '2023-01-03T00:00:00+00:00',
        size: 1024,
        is_private: false,
        mainbranch: {
          type: 'branch',
          name: 'main',
        },
        links: {
          self: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo',
          },
          html: { href: 'https://bitbucket.org/testuser/test-repo' },
          avatar: { href: 'https://avatar.url' },
          pullrequests: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/pullrequests',
          },
          commits: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/commits',
          },
          forks: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/forks',
          },
          watchers: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/watchers',
          },
          downloads: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/downloads',
          },
          clone: [
            {
              name: 'https',
              href: 'https://bitbucket.org/testuser/test-repo.git',
            },
            {
              name: 'ssh',
              href: 'git@bitbucket.org:testuser/test-repo.git',
            },
          ],
        },
        owner: {
          uuid: '{87654321-4321-4321-4321-210987654321}',
          username: 'testuser',
          display_name: 'Test User',
          type: 'user',
          links: {
            self: { href: 'https://api.bitbucket.org/2.0/users/testuser' },
            avatar: { href: 'https://avatar.url' },
            html: { href: 'https://bitbucket.org/testuser' },
          },
        },
        workspace: {
          uuid: '{11111111-1111-1111-1111-111111111111}',
          name: 'testuser',
          slug: 'testuser',
          type: 'workspace',
          links: {
            self: { href: 'https://api.bitbucket.org/2.0/workspaces/testuser' },
            html: { href: 'https://bitbucket.org/testuser' },
            avatar: { href: 'https://avatar.url' },
          },
        },
      };

      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockRepo,
        headers: {},
      });

      const result = await provider.fetchRepository(mockCredentials, 'testuser', 'test-repo');

      expect(result.data.name).toBe('test-repo');
      expect(result.data.fullName).toBe('testuser/test-repo');
      expect(result.data.platform).toBe('bitbucket');
      expect(result.data.size).toBe(1024);
      expect(result.data.owner.username).toBe('testuser');
    });
  });

  describe('fetchFileContent', () => {
    it('should fetch file content successfully', async () => {
      const mockFile = {
        name: 'Portfolio.md',
        path: 'Portfolio.md',
        sha: 'abc123',
        size: 1024,
        url: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/src/main/Portfolio.md',
        html_url: 'https://bitbucket.org/testuser/test-repo/src/main/Portfolio.md',
        git_url:
          'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/src/main/Portfolio.md',
        type: 'commit_file',
        commit: {
          hash: 'abc123',
          type: 'commit',
          links: {
            self: {
              href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/commit/abc123',
            },
            html: {
              href: 'https://bitbucket.org/testuser/test-repo/commits/abc123',
            },
          },
        },
        attributes: [],
        links: {
          self: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/src/main/Portfolio.md',
          },
          meta: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/src/main/Portfolio.md?format=meta',
          },
          history: {
            href: 'https://api.bitbucket.org/2.0/repositories/testuser/test-repo/filehistory/main/Portfolio.md',
          },
        },
      };

      const mockContent = 'Test content';

      // Mock the metadata request
      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockFile,
        headers: {},
      });

      // Mock the content request
      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockContent,
        headers: {},
      });

      const result = await provider.fetchFileContent(
        mockCredentials,
        'testuser',
        'test-repo',
        'Portfolio.md',
      );

      expect(result.data.path).toBe('Portfolio.md');
      expect(result.data.content).toBe('Test content');
      expect(result.data.encoding).toBe('utf8');
      expect(result.data.sha).toBe('abc123');
      expect(result.data.size).toBe(1024);
    });

    it('should handle file not found', async () => {
      const axiosError = new Error('Request failed with status code 404');
      (axiosError as any).response = {
        status: 404,
        data: { message: 'Not Found' },
      };
      (axiosError as any).isAxiosError = true;

      // Mock axios.isAxiosError to return true for our error
      jest.spyOn(require('axios'), 'isAxiosError').mockReturnValue(true);

      (provider as any).httpClient.request.mockRejectedValueOnce(axiosError);

      await expect(
        provider.fetchFileContent(mockCredentials, 'testuser', 'test-repo', 'nonexistent.md'),
      ).rejects.toThrow('Resource not found: Not Found');
    });
  });

  describe('parseRepositoryUrl', () => {
    it('should parse Bitbucket URLs correctly', () => {
      const testCases = [
        {
          url: 'https://bitbucket.org/user/repo',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://bitbucket.org/user/repo.git',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://bitbucket.org/user/repo/',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://bitbucket.org/user/repo/src/main/',
          expected: { owner: 'user', repo: 'repo' },
        },
      ];

      testCases.forEach(({ url, expected }) => {
        expect(provider.parseRepositoryUrl(url)).toEqual(expected);
      });
    });

    it('should return null for invalid URLs', () => {
      const invalidUrls = [
        'https://github.com/user/repo',
        'https://example.com/user/repo',
        'invalid-url',
        'https://bitbucket.org/user',
        'https://bitbucket.org/',
      ];

      invalidUrls.forEach(url => {
        expect(provider.parseRepositoryUrl(url)).toBeNull();
      });
    });
  });

  describe('isValidUrl', () => {
    it('should return true for Bitbucket URLs', () => {
      const validUrls = [
        'https://bitbucket.org/user/repo',
        'https://bitbucket.org/user/repo.git',
        'git@bitbucket.org:user/repo.git',
      ];

      validUrls.forEach(url => {
        expect(provider.isValidUrl(url)).toBe(true);
      });
    });

    it('should return false for non-Bitbucket URLs', () => {
      const invalidUrls = [
        'https://github.com/user/repo',
        'https://gitlab.com/user/repo',
        'https://example.com/user/repo',
      ];

      invalidUrls.forEach(url => {
        expect(provider.isValidUrl(url)).toBe(false);
      });
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';

      // Mock crypto functions
      const crypto = require('crypto');
      const hmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('expected-signature'),
      };
      jest.spyOn(crypto, 'createHmac').mockReturnValue(hmac);
      jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);

      const result = provider.validateWebhookSignature(payload, 'expected-signature', secret);

      expect(result).toBe(true);
      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', secret);
      expect(hmac.update).toHaveBeenCalledWith(payload, 'utf8');
      expect(hmac.digest).toHaveBeenCalledWith('hex');
    });

    it('should reject incorrect signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      const signature = 'invalid-signature';

      const crypto = require('crypto');
      jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(false);

      const result = provider.validateWebhookSignature(payload, signature, secret);

      expect(result).toBe(false);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';
      const scopes = ['repositories', 'account'];
      const state = 'test-state';

      const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes, state);

      expect(url).toContain('https://bitbucket.org/site/oauth2/authorize');
      expect(url).toContain(`client_id=${clientId}`);
      expect(url).toContain('scope=repositories+account');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('response_type=code');
    });

    it('should generate URL without state parameter', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';
      const scopes = ['repositories'];

      const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes);

      expect(url).toContain('https://bitbucket.org/site/oauth2/authorize');
      expect(url).not.toContain('state=');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockTokenResponse = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scopes: 'repositories account',
      };

      (provider as any).httpClient.post.mockResolvedValueOnce({
        data: mockTokenResponse,
      });

      const result = await provider.exchangeCodeForToken(
        'client-id',
        'client-secret',
        'auth-code',
        'redirect-uri',
      );

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.scopes).toEqual(['repositories', 'account']);
      expect(result.tokenExpiresAt).toBeInstanceOf(Date);
    });

    it('should handle token exchange error', async () => {
      const mockErrorResponse = {
        error: 'invalid_grant',
        error_description: 'The provided authorization grant is invalid',
      };

      (provider as any).httpClient.post.mockResolvedValueOnce({
        data: mockErrorResponse,
      });

      await expect(
        provider.exchangeCodeForToken('client-id', 'client-secret', 'invalid-code', 'redirect-uri'),
      ).rejects.toThrow('OAuth error: The provided authorization grant is invalid');
    });
  });
});
