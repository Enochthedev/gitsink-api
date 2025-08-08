import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitHubProvider } from './github.provider';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitHubProvider', () => {
    let provider: GitHubProvider;
    let configService: jest.Mocked<ConfigService>;

    const mockCredentials = {
        accessToken: 'test-token',
    };

    beforeEach(async () => {
        // Setup axios mock before creating the module
        const mockAxiosInstance = {
            request: jest.fn(),
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() },
            },
        };

        mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GitHubProvider,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
            ],
        }).compile();

        provider = module.get<GitHubProvider>(GitHubProvider);
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
                login: 'testuser',
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
            const mockRepo = {
                id: 123,
                name: 'test-repo',
                full_name: 'testuser/test-repo',
                description: 'Test repository',
                html_url: 'https://github.com/testuser/test-repo',
                clone_url: 'https://github.com/testuser/test-repo.git',
                ssh_url: 'git@github.com:testuser/test-repo.git',
                default_branch: 'main',
                language: 'TypeScript',
                topics: ['test', 'example'],
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-02T00:00:00Z',
                pushed_at: '2023-01-03T00:00:00Z',
                stargazers_count: 10,
                forks_count: 5,
                open_issues_count: 2,
                private: false,
                fork: false,
                archived: false,
                disabled: false,
                has_wiki: true,
                has_pages: false,
                has_issues: true,
                has_projects: true,
                has_downloads: true,
                license: {
                    key: 'mit',
                    name: 'MIT License',
                    spdx_id: 'MIT',
                },
                size: 1024,
                owner: {
                    id: 456,
                    login: 'testuser',
                    type: 'User',
                    avatar_url: 'https://avatar.url',
                },
            };

            (provider as any).httpClient.request.mockResolvedValueOnce({
                data: mockRepo,
                headers: {},
            });

            const result = await provider.fetchRepository(mockCredentials, 'testuser', 'test-repo');

            expect(result.data.name).toBe('test-repo');
            expect(result.data.fullName).toBe('testuser/test-repo');
            expect(result.data.platform).toBe('github');
            expect(result.data.starCount).toBe(10);
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
                url: 'https://api.github.com/repos/testuser/test-repo/contents/Portfolio.md',
                html_url: 'https://github.com/testuser/test-repo/blob/main/Portfolio.md',
                git_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs/abc123',
                download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/Portfolio.md',
                type: 'file',
                content: 'VGVzdCBjb250ZW50', // Base64 encoded "Test content"
                encoding: 'base64',
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
            expect(result.data.sha).toBe('abc123');
            expect(result.data.size).toBe(1024);
        });

        it('should handle file not found', async () => {
            const axiosError = new Error('Request failed with status code 404');
            (axiosError as any).response = { status: 404, data: { message: 'Not Found' } };
            (axiosError as any).isAxiosError = true;

            // Mock axios.isAxiosError to return true for our error
            jest.spyOn(require('axios'), 'isAxiosError').mockReturnValue(true);

            (provider as any).httpClient.request.mockRejectedValueOnce(axiosError);

            await expect(
                provider.fetchFileContent(mockCredentials, 'testuser', 'test-repo', 'nonexistent.md')
            ).rejects.toThrow('Resource not found: Not Found');
        });
    });

    describe('parseRepositoryUrl', () => {
        it('should parse GitHub URLs correctly', () => {
            const testCases = [
                {
                    url: 'https://github.com/user/repo',
                    expected: { owner: 'user', repo: 'repo' },
                },
                {
                    url: 'https://github.com/user/repo.git',
                    expected: { owner: 'user', repo: 'repo' },
                },
                {
                    url: 'https://github.com/user/repo/',
                    expected: { owner: 'user', repo: 'repo' },
                },
                {
                    url: 'https://github.com/user/repo/issues',
                    expected: { owner: 'user', repo: 'repo' },
                },
            ];

            testCases.forEach(({ url, expected }) => {
                expect(provider.parseRepositoryUrl(url)).toEqual(expected);
            });
        });

        it('should return null for invalid URLs', () => {
            const invalidUrls = [
                'https://gitlab.com/user/repo',
                'https://example.com/user/repo',
                'invalid-url',
                'https://github.com/user',
                'https://github.com/',
            ];

            invalidUrls.forEach(url => {
                expect(provider.parseRepositoryUrl(url)).toBeNull();
            });
        });
    });

    describe('isValidUrl', () => {
        it('should return true for GitHub URLs', () => {
            const validUrls = [
                'https://github.com/user/repo',
                'https://github.com/user/repo.git',
                'git@github.com:user/repo.git',
            ];

            validUrls.forEach(url => {
                expect(provider.isValidUrl(url)).toBe(true);
            });
        });

        it('should return false for non-GitHub URLs', () => {
            const invalidUrls = [
                'https://gitlab.com/user/repo',
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
            const signature = 'sha256=4864d2759938a15468c2902c4f5d5e8c4c7b4e1c8b5e5f5e5e5e5e5e5e5e5e5e';

            // Mock crypto to return expected signature
            const crypto = require('crypto');
            const hmac = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('4864d2759938a15468c2902c4f5d5e8c4c7b4e1c8b5e5f5e5e5e5e5e5e5e5e5e'),
            };
            jest.spyOn(crypto, 'createHmac').mockReturnValue(hmac);
            jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);

            const result = provider.validateWebhookSignature(payload, signature, secret);

            expect(result).toBe(true);
            expect(crypto.createHmac).toHaveBeenCalledWith('sha256', secret);
            expect(hmac.update).toHaveBeenCalledWith(payload, 'utf8');
            expect(hmac.digest).toHaveBeenCalledWith('hex');
        });

        it('should reject incorrect signature', () => {
            const payload = '{"test": "data"}';
            const secret = 'test-secret';
            const signature = 'sha256=invalid-signature';

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
            const scopes = ['repo', 'user:email'];
            const state = 'test-state';

            const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes, state);

            expect(url).toContain('https://github.com/login/oauth/authorize');
            expect(url).toContain(`client_id=${clientId}`);
            expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
            expect(url).toContain('scope=repo+user%3Aemail');
            expect(url).toContain(`state=${state}`);
            expect(url).toContain('response_type=code');
        });

        it('should generate URL without state parameter', () => {
            const clientId = 'test-client-id';
            const redirectUri = 'https://example.com/callback';
            const scopes = ['repo'];

            const url = provider.getAuthorizationUrl(clientId, redirectUri, scopes);

            expect(url).toContain('https://github.com/login/oauth/authorize');
            expect(url).not.toContain('state=');
        });
    });
});