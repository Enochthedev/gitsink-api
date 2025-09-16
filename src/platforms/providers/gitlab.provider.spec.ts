import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitLabProvider } from './gitlab.provider';

jest.mock('axios');

describe('GitLabProvider', () => {
  let provider: GitLabProvider;
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
        GitLabProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<GitLabProvider>(GitLabProvider);
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
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://avatar.url',
      };

      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockUser,
        headers: {},
      });

      const result = await provider.authenticate(mockCredentials);

      expect(result.success).toBe(true);
      expect(result.user).toEqual({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
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
      const mockProject = {
        id: 123,
        name: 'test-repo',
        name_with_namespace: 'testuser/test-repo',
        path: 'test-repo',
        path_with_namespace: 'testuser/test-repo',
        description: 'Test repository',
        web_url: 'https://gitlab.com/testuser/test-repo',
        http_url_to_repo: 'https://gitlab.com/testuser/test-repo.git',
        ssh_url_to_repo: 'git@gitlab.com:testuser/test-repo.git',
        default_branch: 'main',
        topics: ['test', 'example'],
        created_at: '2023-01-01T00:00:00Z',
        last_activity_at: '2023-01-03T00:00:00Z',
        star_count: 10,
        forks_count: 5,
        open_issues_count: 2,
        visibility: 'public',
        archived: false,
        issues_enabled: true,
        merge_requests_enabled: true,
        wiki_enabled: true,
        jobs_enabled: true,
        snippets_enabled: true,
        container_registry_enabled: false,
        service_desk_enabled: false,
        can_create_merge_request_in: true,
        issues_access_level: 'enabled',
        repository_access_level: 'enabled',
        merge_requests_access_level: 'enabled',
        forking_access_level: 'enabled',
        wiki_access_level: 'enabled',
        builds_access_level: 'enabled',
        snippets_access_level: 'enabled',
        pages_access_level: 'enabled',
        analytics_access_level: 'enabled',
        container_registry_access_level: 'disabled',
        security_and_compliance_access_level: 'enabled',
        releases_access_level: 'enabled',
        environments_access_level: 'enabled',
        feature_flags_access_level: 'enabled',
        infrastructure_access_level: 'enabled',
        monitor_access_level: 'enabled',
        model_experiments_access_level: 'enabled',
        model_registry_access_level: 'enabled',
        empty_repo: false,
        license: {
          key: 'mit',
          name: 'MIT License',
        },
        namespace: {
          id: 456,
          name: 'testuser',
          path: 'testuser',
          kind: 'user',
          full_path: 'testuser',
          avatar_url: 'https://avatar.url',
          web_url: 'https://gitlab.com/testuser',
        },
      };

      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockProject,
        headers: {},
      });

      const result = await provider.fetchRepository(mockCredentials, 'testuser', 'test-repo');

      expect(result.data.name).toBe('test-repo');
      expect(result.data.fullName).toBe('testuser/test-repo');
      expect(result.data.platform).toBe('gitlab');
      expect(result.data.starCount).toBe(10);
      expect(result.data.owner.username).toBe('testuser');
    });
  });

  describe('fetchFileContent', () => {
    it('should fetch file content successfully', async () => {
      const mockFile = {
        file_name: 'Portfolio.md',
        file_path: 'Portfolio.md',
        size: 1024,
        encoding: 'base64',
        content_sha256: 'abc123',
        ref: 'main',
        blob_id: 'blob123',
        commit_id: 'commit123',
        last_commit_id: 'commit123',
        content: 'VGVzdCBjb250ZW50', // Base64 encoded "Test content"
      };

      (provider as any).httpClient.request.mockResolvedValueOnce({
        data: mockFile,
        headers: {},
      });

      const result = await provider.fetchFileContent(
        mockCredentials,
        'testuser',
        'test-repo',
        'Portfolio.md',
      );

      expect(result.data.path).toBe('Portfolio.md');
      expect(result.data.content).toBe('VGVzdCBjb250ZW50');
      expect(result.data.encoding).toBe('base64');
      expect(result.data.sha).toBe('blob123');
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
    it('should parse GitLab URLs correctly', () => {
      const testCases = [
        {
          url: 'https://gitlab.com/user/repo',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://gitlab.com/user/repo.git',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://gitlab.com/user/repo/',
          expected: { owner: 'user', repo: 'repo' },
        },
        {
          url: 'https://gitlab.com/user/repo/-/issues',
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
        'https://gitlab.com/user',
        'https://gitlab.com/',
      ];

      invalidUrls.forEach(url => {
        expect(provider.parseRepositoryUrl(url)).toBeNull();
      });
    });
  });

  describe('isValidUrl', () => {
    it('should return true for GitLab URLs', () => {
      const validUrls = [
        'https://gitlab.com/user/repo',
        'https://gitlab.com/user/repo.git',
        'git@gitlab.com:user/repo.git',
      ];

      validUrls.forEach(url => {
        expect(provider.isValidUrl(url)).toBe(true);
      });
    });

    it('should return false for non-GitLab URLs', () => {
      const invalidUrls = [
        'https://github.com/user/repo',
        'https://bitbucket.org/user/repo',
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
      const signature = 'test-secret'; // GitLab uses token-based validation

      const result = provider.validateWebhookSignature(payload, signature, secret);

      expect(result).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      const signature = 'invalid-signature';

      const result = provider.validateWebhookSignature(payload, signature, secret);

      expect(result).toBe(false);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';
      const scopes = ['read_user', 'read_repository'];
      const state = 'test-state';

      const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes, state);

      expect(url).toContain('https://gitlab.com/oauth/authorize');
      expect(url).toContain(`client_id=${clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(url).toContain('scope=read_user+read_repository');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('response_type=code');
    });

    it('should generate URL without state parameter', () => {
      const clientId = 'test-client-id';
      const redirectUri = 'https://example.com/callback';
      const scopes = ['read_user'];

      const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes);

      expect(url).toContain('https://gitlab.com/oauth/authorize');
      expect(url).not.toContain('state=');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockTokenResponse = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope: 'read_user read_repository',
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
      expect(result.scopes).toEqual(['read_user', 'read_repository']);
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
